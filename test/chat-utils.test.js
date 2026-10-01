import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { writeActivityLog } from '../src/activity-log.js';
import { MICROSOFT_DEVICE_LOGIN_URL, formatMicrosoftDeviceCodeNotice } from '../src/auth-utils.js';
import { isCommandMessage, normalizePlayerName, getPlayerRole, isBotMentioned, parseSystemChatMessage, isSystemAnnouncement, getGeminiErrorSummary, getRequestedAction, parseWorldCommand, calculateShortfall, findInventoryItem, getIdleWanderOffset, chooseRandomAutonomyGoal, findBlockIdsMatchingNames, formatChatResponse, canSleepAtMinecraftTime, isOverworldDimension } from '../src/chat-utils.js';

test('commands are detected after leading whitespace', () => {
  assert.equal(isCommandMessage('  !help'), true);
  assert.equal(isCommandMessage('hello!'), false);
});

test('activity records are appended as timestamped JSON lines', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'minecraft-ai-bot-'));
  const logPath = join(directory, 'logs', 'activity.jsonl');
  const dailyPath = join(directory, 'logs', 'activity-2026-09-27.jsonl');

  try {
    const timestamp = new Date('2026-09-27T12:00:00.000Z');
    await writeActivityLog(logPath, 'movement.started', { actor: 'player123', x: 4, y: 65, z: -2 }, timestamp);
    await writeActivityLog(logPath, 'movement.completed', { actor: 'player123' }, timestamp);
    const lines = (await readFile(dailyPath, 'utf8')).trim().split('\n').map(JSON.parse);

    assert.equal(lines.length, 2);
    assert.equal(lines[0].event, 'movement.started');
    assert.equal(lines[0].actor, 'player123');
    assert.equal(Number.isNaN(Date.parse(lines[0].timestamp)), false);
    assert.equal(lines[1].event, 'movement.completed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Microsoft device sign-in instructions prominently show URL and code', () => {
  const notice = formatMicrosoftDeviceCodeNotice({
    user_code: 'AB12CD34',
    verification_uri: 'https://www.microsoft.com/link'
  });

  assert.match(notice, new RegExp(MICROSOFT_DEVICE_LOGIN_URL));
  assert.match(notice, /Code: AB12CD34/);
  assert.match(notice, /https:\/\/www\.microsoft\.com\/link/);
});

test('completed UTC weeks are compressed and daily files are removed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'minecraft-ai-bot-'));
  const logPath = join(directory, 'activity.jsonl');
  const weekDates = [
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
    '2026-09-25', '2026-09-26', '2026-09-27'
  ];

  try {
    for (const date of weekDates) {
      await writeActivityLog(logPath, 'test.event', { date }, new Date(`${date}T12:00:00.000Z`));
    }
    await writeActivityLog(logPath, 'next.week', {}, new Date('2026-09-28T12:00:00.000Z'));

    const files = await readdir(directory);
    const archive = join(directory, 'activity-week-2026-09-21.jsonl.gz');
    const archivedLines = gunzipSync(await readFile(archive)).toString('utf8').trim().split('\n');
    assert.equal(archivedLines.length, 7);
    assert.equal(files.includes('activity-2026-09-20.jsonl'), false);
    for (const date of weekDates) assert.equal(files.includes(`activity-${date}.jsonl`), false);
    assert.equal(files.includes('activity-2026-09-28.jsonl'), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('player names normalize display prefixes and letter casing', () => {
  assert.equal(normalizePlayerName('.FujiwaraKaz'), '.fujiwarakaz');
  assert.equal(normalizePlayerName('FUJIWARAKAZ'), 'fujiwarakaz');
  assert.equal(getPlayerRole('fujiwarakaz', 'FujiwaraKaz', '.fujiwarakaz'), 'bot');
  assert.equal(getPlayerRole('.FujiwaraKaz', 'fujiwarakaz', '.fujiwarakaz'), 'developer');
  assert.equal(getPlayerRole('.FujiwaraKaz', 'dedicated_minecraft_bot', ['.fujiwarakaz', 'fujiwarakaz']), 'developer');
  assert.equal(getPlayerRole('FujiwaraKaz', 'dedicated_minecraft_bot', ['.fujiwarakaz', 'fujiwarakaz']), 'developer');
});

test('Gemini addressing recognizes the bot name and Steve aliases only', () => {
  assert.equal(isBotMentioned('Steve_AI_Bot こんにちは', 'Steve_AI_Bot'), true);
  assert.equal(isBotMentioned('@Steve_AI_Bot 家建てて', 'Steve_AI_Bot'), true);
  assert.equal(isBotMentioned('Steve、調子どう？', 'Steve_AI_Bot'), true);
  assert.equal(isBotMentioned('スティーブ、調子どう？', 'dedicated_minecraft_bot'), true);
  assert.equal(isBotMentioned('木材集めるね', 'Steve_AI_Bot'), false);
  assert.equal(isBotMentioned('SteveJobs、こんにちは', 'Steve_AI_Bot'), false);
});

test('player chat can be extracted from system-formatted messages', () => {
  assert.deepEqual(parseSystemChatMessage('player123: ここに来て'), {
    username: 'player123',
    message: 'ここに来て'
  });
  assert.deepEqual(parseSystemChatMessage('.player123: !come'), {
    username: '.player123',
    message: '!come'
  });
  assert.equal(parseSystemChatMessage('Server restarted'), null);
});

test('system announcements are filtered from Gemini requests', () => {
  assert.equal(isSystemAnnouncement('GeyserUpdater', '最新です'), true);
  assert.equal(isSystemAnnouncement('Server', 'コマンド一覧を表示します'), true);
  assert.equal(isSystemAnnouncement('GeyserUpdater', 'The plugin is up to date'), true);
  assert.equal(isSystemAnnouncement('player123', 'こんにちは'), false);
});

test('Gemini API errors expose HTTP status and retry metadata', () => {
  const quotaError = getGeminiErrorSummary({
    status: 429,
    message: JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Quota exceeded',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '45s' }]
      }
    })
  });
  assert.deepEqual(quotaError, {
    httpStatus: 429,
    apiStatus: 'RESOURCE_EXHAUSTED',
    message: 'Quota exceeded',
    retryDelay: '45s'
  });

  const unavailableError = getGeminiErrorSummary({ status: 503, message: 'Model unavailable' });
  assert.equal(unavailableError.httpStatus, 503);
  assert.equal(unavailableError.message, 'Model unavailable');
});

test('movement, stop, and build commands are routed as actions', () => {
  assert.equal(getRequestedAction('!come'), 'come');
  assert.equal(getRequestedAction('ここ来て'), 'come');
  assert.equal(getRequestedAction('ここにきて'), 'come');
  assert.equal(getRequestedAction('ここに集合して'), 'come');
  assert.equal(getRequestedAction('ここに来て'), 'come');
  assert.equal(getRequestedAction('こっちにきて'), 'come');
  assert.equal(getRequestedAction('とまれ'), 'stop');
  assert.equal(getRequestedAction('!stop'), 'stop');
  assert.equal(getRequestedAction('家を建てて'), 'build');
  assert.equal(getRequestedAction('!build'), 'build');
  assert.equal(getRequestedAction('!goals'), 'list_goals');
  assert.equal(getRequestedAction('目標一覧'), 'list_goals');
  const setGoalRes = getRequestedAction('!goal mining');
  assert.equal(typeof setGoalRes, 'object');
  assert.equal(setGoalRes.type, 'set_goal');
  assert.equal(setGoalRes.goal.kind, 'mining');
  assert.equal(getRequestedAction('寝ないで'), 'stay_awake');
  assert.equal(getRequestedAction('今夜は徹夜だよ'), 'stay_awake');
  assert.equal(getRequestedAction('寝て'), 'allow_sleep');
  assert.equal(getRequestedAction('おやすみ'), 'allow_sleep');
  assert.equal(getRequestedAction('こんにちは'), null);
  assert.equal(getRequestedAction('!unknown'), null);
});

test('weather and difficulty requests are parsed into allowlisted server values', () => {
  assert.deepEqual(parseWorldCommand('!weather clear'), { type: 'weather', value: 'clear' });
  assert.deepEqual(parseWorldCommand('!weather thunder'), { type: 'weather', value: 'thunder' });
  assert.deepEqual(parseWorldCommand('天気を雨にして'), { type: 'weather', value: 'rain' });
  assert.deepEqual(parseWorldCommand('難易度をハードにして'), { type: 'difficulty', value: 'hard' });
  assert.deepEqual(parseWorldCommand('!difficulty peaceful'), { type: 'difficulty', value: 'peaceful' });
  assert.deepEqual(parseWorldCommand('!weather'), { type: 'weather', value: null });
  assert.equal(parseWorldCommand('こんにちは'), null);
});

test('material shortfall is reported as a non-negative exact count', () => {
  assert.equal(calculateShortfall(32, 20), 12);
  assert.equal(calculateShortfall(32, 32), 0);
  assert.equal(calculateShortfall(32, 40), 0);
});

test('inventory items can be selected by name or default to the first item', () => {
  const inventory = [
    { name: 'oak_planks', displayName: 'Oak Planks', count: 12 },
    { name: 'diamond_sword', displayName: 'Diamond Sword', count: 1 }
  ];
  assert.equal(findInventoryItem(inventory).name, 'oak_planks');
  assert.equal(findInventoryItem(inventory, 'diamond sword').name, 'diamond_sword');
  assert.equal(findInventoryItem(inventory, 'missing'), null);
});

    test('weather and difficulty requests are parsed into allowlisted server values', () => {
      assert.deepEqual(parseWorldCommand('!weather clear'), { type: 'weather', value: 'clear' });
      assert.deepEqual(parseWorldCommand('!weather thunder'), { type: 'weather', value: 'thunder' });
      assert.deepEqual(parseWorldCommand('天気を雨にして'), { type: 'weather', value: 'rain' });
      assert.deepEqual(parseWorldCommand('難易度をハードにして'), { type: 'difficulty', value: 'hard' });
      assert.deepEqual(parseWorldCommand('!difficulty peaceful'), { type: 'difficulty', value: 'peaceful' });
      assert.deepEqual(parseWorldCommand('!weather'), { type: 'weather', value: null });
      assert.equal(parseWorldCommand('こんにちは'), null);
    });

test('idle wander offsets stay nearby and are never zero', () => {
  assert.deepEqual(getIdleWanderOffset(6, () => 0.5), { x: 0, z: 1 });
  const edgeOffset = getIdleWanderOffset(6, () => 0);
  assert.deepEqual(edgeOffset, { x: -6, z: -6 });
});

test('autonomy goals are randomly selected from available candidates', () => {
  const goals = [{ id: 'explore' }, { id: 'visit_animal' }, { id: 'visit_cushion' }];
  assert.equal(chooseRandomAutonomyGoal(goals, () => 0.7).id, 'visit_cushion');
  assert.equal(chooseRandomAutonomyGoal([], () => 0.5), null);
});

test('seat-like blocks are selected for pathfinder avoidance', () => {
  const blockIds = findBlockIdsMatchingNames({
    oak_cushion: { id: 10 },
    red_chair: { id: 11 },
    stone: { id: 1 }
  }, ['cushion', 'chair', 'seat']);
  assert.deepEqual(blockIds, [10, 11]);
});

test('Gemini responses are flattened into one chat line', () => {
  assert.equal(formatChatResponse('  こんにちは\n元気だよ。  '), 'こんにちは 元気だよ。');
  assert.equal(formatChatResponse(null), '');
});

test('chat responses are limited to 256 characters', () => {
  assert.equal(formatChatResponse('a'.repeat(300)).length, 256);
});

test('sleep is allowed at night or during thunderstorms', () => {
  assert.equal(canSleepAtMinecraftTime({ timeOfDay: 0 }), false);
  assert.equal(canSleepAtMinecraftTime({ timeOfDay: 6000 }), false);
  assert.equal(canSleepAtMinecraftTime({ timeOfDay: 12541 }), true);
  assert.equal(canSleepAtMinecraftTime({ timeOfDay: 18000 }), true);
  assert.equal(canSleepAtMinecraftTime({ timeOfDay: 23458 }), true);
  assert.equal(canSleepAtMinecraftTime({ timeOfDay: 23459 }), false);
  assert.equal(canSleepAtMinecraftTime({ timeOfDay: 0, isRaining: true, thunderState: 1 }), true);
  assert.equal(canSleepAtMinecraftTime({ timeOfDay: 0, isRaining: true, thunderState: 0 }), false);
});

test('beds can only be used in the overworld', () => {
  assert.equal(isOverworldDimension('minecraft:overworld'), true);
  assert.equal(isOverworldDimension('overworld'), true);
  assert.equal(isOverworldDimension('minecraft:the_nether'), false);
  assert.equal(isOverworldDimension('minecraft:the_end'), false);
});
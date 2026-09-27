import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import mineflayer from 'mineflayer';
import pathfinderPlugin from 'mineflayer-pathfinder';
import chatMessageFactory from 'prismarine-chat';
import { DEFAULT_ACTIVITY_LOG_PATH, writeActivityLog } from './activity-log.js';
import { formatMicrosoftDeviceCodeNotice } from './auth-utils.js';
import { isCommandMessage, normalizePlayerName, getPlayerRole, parseSystemChatMessage, isSystemAnnouncement, isBotMentioned, getGeminiErrorSummary, getRequestedAction, parseWorldCommand, calculateShortfall, findInventoryItem, getIdleWanderOffset, chooseRandomAutonomyGoal, findBlockIdsMatchingNames, formatChatResponse } from './chat-utils.js';

const { pathfinder, Movements, goals: { GoalNear } } = pathfinderPlugin;
const developerUsernames = (process.env.DEVELOPER_USERNAMES || '.fujiwarakaz,fujiwarakaz')
  .split(',')
  .map((username) => username.trim())
  .filter(Boolean);
const activityLogPath = process.env.ACTIVITY_LOG_PATH ?? DEFAULT_ACTIVITY_LOG_PATH;
const idleWanderAfterMs = readPositiveInteger(process.env.IDLE_WANDER_AFTER_MS, 6000);
const idleWanderRadius = Math.min(16, readPositiveInteger(process.env.IDLE_WANDER_RADIUS, 6));
const autonomyIntervalMs = readPositiveInteger(process.env.AUTONOMY_INTERVAL_MS, 30 * 60 * 1000);
const autonomyActionIntervalMs = readPositiveInteger(process.env.AUTONOMY_ACTION_INTERVAL_MS, 6000);
const idleWanderAvoidNames = (process.env.IDLE_WANDER_AVOID_BLOCKS ?? 'chair,seat').split(',');

function recordActivity(event, details = {}) {
  void writeActivityLog(activityLogPath, event, details);
}

function readPositiveInteger(value, fallback) {
  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not set. Copy .env.example to .env and add your API key.');
}

const ai = new GoogleGenAI({ apiKey });
const bot = mineflayer.createBot({
  host: process.env.MC_HOST ?? 'localhost',
  port: Number(process.env.MC_PORT ?? 25565),
  username: process.env.MC_USERNAME ?? 'dedicated_minecraft_bot',
  auth: process.env.MC_AUTH ?? 'microsoft',
  onMsaCode: (deviceCode) => console.log(formatMicrosoftDeviceCodeNotice(deviceCode)),
  logErrors: false,
  version: process.env.MC_VERSION ?? '26.1'
});
bot.loadPlugin(pathfinder);

let movements;
let movementGeneration = 0;
let activeBuild;
let idleJumpTimer;
let jumpReleaseTimer;
let autonomyCycleTimer;
let autonomyActive = false;
let autonomyGeneration = 0;
let currentAutonomyGoal;
let autonomyGoalComplete = false;
let lastPlayerActivity = Date.now();
let lastAutonomyDeferredReason;
let nextAutonomyGoalAt = 0;
let nextAutonomyActionAt = 0;
let shuttingDown = false;

function clearRuntimeTimers() {
  if (idleJumpTimer) clearInterval(idleJumpTimer);
  if (jumpReleaseTimer) clearTimeout(jumpReleaseTimer);
  if (autonomyCycleTimer) clearInterval(autonomyCycleTimer);
  idleJumpTimer = undefined;
  jumpReleaseTimer = undefined;
  autonomyCycleTimer = undefined;
}

const systemInstruction = [
  'あなたはMinecraftの世界にいる「スティーブ」です。',
  '明るく頼もしい相棒として、日本語で2〜3文以内で返答してください。',
  '語尾は「〜だよ」「〜だね」のような親しみやすい口調にしてください。',
  'Minecraftの世界観を保ち、改行は使わないでください。'
].join('\n');

bot.once('spawn', () => {
  lastPlayerActivity = Date.now();
  nextAutonomyGoalAt = Date.now() + autonomyIntervalMs;
  nextAutonomyActionAt = Date.now() + autonomyActionIntervalMs;
  movements = new Movements(bot);
  movements.canDig = false;
  const avoidedBlockIds = findBlockIdsMatchingNames(bot.registry.blocksByName, idleWanderAvoidNames);
  for (const blockId of avoidedBlockIds) movements.blocksToAvoid.add(blockId);
  bot.pathfinder.setMovements(movements);
  recordActivity('bot.connected', {
    host: process.env.MC_HOST ?? 'localhost',
    username: bot.username,
    version: bot.version
  });
  console.log(`Connected to ${process.env.MC_HOST ?? 'localhost'}`);
  console.log('普通のチャットで話しかけてね。コマンド一覧は !help で確認できます。');
  bot.chat('普通のチャットにそのまま話しかけてね。手に持つアイテムは !hold [名前]、一覧は !help で確認できるよ。');
  idleJumpTimer = setInterval(() => {
    if (bot._client.ended || bot.vehicle || !bot.entity?.onGround || bot.pathfinder.isMoving() || activeBuild || autonomyActive) return;

    bot.setControlState('jump', true);
    recordActivity('idle_jump');
    jumpReleaseTimer = setTimeout(() => {
      jumpReleaseTimer = undefined;
      if (!bot._client.ended) bot.setControlState('jump', false);
    }, 150);
  }, 30000);
  autonomyCycleTimer = setInterval(runAutonomyCycle, 1000);
});

let lastHandledChat;
let lastGeminiRequestAt;

function handlePlayerChat(username, message) {
  if (!message.trim()) return;
  const key = `${username}\0${message}`;
  const now = Date.now();
  if (lastHandledChat?.key === key && now - lastHandledChat.time < 250) return;
  lastHandledChat = { key, time: now };
  const role = getPlayerRole(username, bot.username, developerUsernames);
  if (role === 'bot' || isSystemAnnouncement(username, message)) return;
  lastPlayerActivity = now;
  lastAutonomyDeferredReason = undefined;
  cancelAutonomyGoal();
  void lookAtPlayer(username);

  if (isCommandMessage(message)) {
    recordActivity('command.received', {
      actor: username,
      command: message.trim().split(/\s+/, 1)[0].toLowerCase()
    });
    handleCommand(username, message);
    return;
  }

  const action = getRequestedAction(message);
  if (action) {
    dispatchAction(username, action);
    return;
  }

  const worldCommand = parseWorldCommand(message);
  if (worldCommand) {
    void executeWorldCommand(username, worldCommand);
    return;
  }

  if (!isBotMentioned(message, bot.username)) return;
  void replyWithGemini(username, message);
}

function usernameFromSender(sender) {
  const senderUuid = String(sender ?? '').replaceAll('-', '').toLowerCase();
  if (!senderUuid) return null;

  return Object.entries(bot.players).find(([, player]) =>
    String(player.uuid ?? '').replaceAll('-', '').toLowerCase() === senderUuid
  )?.[0] ?? null;
}

function findPlayerByName(username) {
  return Object.entries(bot.players).find(([playerName]) =>
    normalizePlayerName(playerName) === normalizePlayerName(username)
  ) ?? null;
}

bot.on('message', (jsonMessage, position, sender) => {
  const text = jsonMessage.toString();

  const parsed = parseSystemChatMessage(text);
  if (position === 'system') {
    if (!parsed) return;
    const playerEntry = findPlayerByName(parsed.username);
    const action = getRequestedAction(parsed.message);
    const command = isCommandMessage(parsed.message);
    if (playerEntry || action || command) {
      handlePlayerChat(playerEntry?.[0] ?? parsed.username, parsed.message);
    }
    return;
  }

  if (position !== 'chat') return;
  const username = parsed?.username ?? usernameFromSender(sender);
  const playerMessage = parsed?.message ?? text;
  if (username) handlePlayerChat(username, playerMessage);
});

bot.on('chat', (username, message) => handlePlayerChat(username, message));

bot.on('messagestr', (message, position) => {
  if (position !== 'system') return;

  const parsed = parseSystemChatMessage(message);
  if (!parsed) return;
  const playerEntry = findPlayerByName(parsed.username);
  if (!playerEntry && !isCommandMessage(parsed.message) && !getRequestedAction(parsed.message)) return;
  handlePlayerChat(playerEntry?.[0] ?? parsed.username, parsed.message);
});

function handleCommand(username, message) {
  const [command] = message.trim().toLowerCase().split(/\s+/);
  const action = getRequestedAction(message);
  console.info(`[command] ${username}: ${command}`);
  const worldCommand = parseWorldCommand(message);

  if (worldCommand) {
    void executeWorldCommand(username, worldCommand);
    return;
  }

  if (command === '!help') {
    bot.chat('使えるコマンドは !help、!ping、!come、!stop、!build、!hold [名前]、!weather、!difficulty だよ。');
  } else if (command === '!ping') {
    bot.chat('pong');
  } else if (command === '!hold') {
    void holdItem(username, message.trim().slice(command.length).trim());
  } else if (action) {
    dispatchAction(username, action);
  } else {
    bot.chat('そのコマンドはまだ使えないよ。!helpを見てね。');
  }
}

function executeWorldCommand(username, request) {
  if (getPlayerRole(username, bot.username, developerUsernames) !== 'developer') {
    recordActivity('world_command.rejected', { actor: username, type: request.type, reason: 'not_developer' });
    bot.chat('天気や難易度の変更は開発者だけが実行できるよ。');
    return;
  }

  const allowedValues = request.type === 'weather'
    ? ['clear', 'rain', 'thunder']
    : ['peaceful', 'easy', 'normal', 'hard'];
  if (!allowedValues.includes(request.value)) {
    const usage = request.type === 'weather'
      ? '!weather clear|rain|thunder'
      : '!difficulty peaceful|easy|normal|hard';
    bot.chat(`使い方: ${usage}`);
    return;
  }

  recordActivity('world_command.sent', { actor: username, type: request.type, value: request.value });
  console.info(`[world-command] ${username}: ${request.type} ${request.value}`);
  bot.chat(`/${request.type} ${request.value}`);
}

function cancelAutonomyGoal() {
  if (!autonomyActive) return;
  autonomyActive = false;
  autonomyGeneration += 1;
  bot.pathfinder.setGoal(null);
  recordActivity('autonomy_goal.cancelled', { reason: 'player_activity' });
}

function getAutonomyGoals() {
  const origin = bot.entity.position.floored();
  const goals = [{
    kind: 'explore',
    description: '近くを探検'
  }];

  const nearbyPlayers = Object.entries(bot.players)
    .filter(([name, player]) => player.entity && getPlayerRole(name, bot.username, developerUsernames) !== 'bot')
    .map(([name, player]) => ({ name, entity: player.entity }))
    .filter(({ entity }) => origin.distanceTo(entity.position) <= idleWanderRadius * 2)
    .sort((left, right) => origin.distanceTo(left.entity.position) - origin.distanceTo(right.entity.position));
  if (nearbyPlayers.length > 0) {
    const player = nearbyPlayers[0];
    goals.push({
      kind: 'visit_player',
      description: `${player.name}の近くへ行く`,
      targetName: player.name
    });
  }

  const friendlyMobNames = new Set(['allay', 'armadillo', 'axolotl', 'bee', 'camel', 'cat', 'chicken', 'cow', 'donkey', 'fox', 'frog', 'goat', 'horse', 'llama', 'mooshroom', 'mule', 'ocelot', 'parrot', 'pig', 'rabbit', 'sheep', 'sniffer', 'strider', 'turtle', 'wolf']);
  const nearbyMob = Object.values(bot.entities)
    .filter((entity) => friendlyMobNames.has(entity.name) && entity.position && origin.distanceTo(entity.position) <= idleWanderRadius * 2)
    .sort((left, right) => origin.distanceTo(left.position) - origin.distanceTo(right.position))[0];
  if (nearbyMob) {
    goals.push({
      kind: 'visit_animal',
      description: `近くの${nearbyMob.name}を見に行く`,
      entityId: nearbyMob.id,
      targetName: nearbyMob.name
    });
  }

  const cushionPosition = bot.findBlock({
    matching: (block) => /cushion/i.test(block.name),
    maxDistance: idleWanderRadius * 2
  });
  const cushion = cushionPosition && bot.blockAt(cushionPosition);
  if (cushion) {
    goals.push({
      kind: 'visit_cushion',
      description: '近くのクッションでひと休み',
      goal: new GoalNear(cushion.position.x, cushion.position.y, cushion.position.z, 1),
      blockPosition: cushion.position
    });
  }
  return goals;
}

function runAutonomyCycle() {
  if (bot._client.ended || !bot.entity?.position) return;

  const now = Date.now();
  if (now >= nextAutonomyGoalAt) {
    if (autonomyActive) cancelAutonomyGoal();
    currentAutonomyGoal = chooseRandomAutonomyGoal(getAutonomyGoals());
    autonomyGoalComplete = false;
    nextAutonomyGoalAt = now + autonomyIntervalMs;
    lastAutonomyDeferredReason = undefined;
    recordActivity('autonomy_goal.selected', {
      goal: currentAutonomyGoal.kind,
      description: currentAutonomyGoal.description
    });
    bot.chat(`30分ごとの目標: ${currentAutonomyGoal.description}だよ！`);
    console.info(`[autonomy] Goal selected: ${currentAutonomyGoal.kind}`);
  }

  if (now < nextAutonomyActionAt || autonomyGoalComplete || !currentAutonomyGoal) return;
  nextAutonomyActionAt = now + autonomyActionIntervalMs;
  if (Date.now() - lastPlayerActivity < idleWanderAfterMs) return;

  const isPathfinderMoving = bot.pathfinder.isMoving();
  const deferredReason = activeBuild ? 'building' : autonomyActive ? 'already_running' : isPathfinderMoving ? 'pathfinder_busy' : null;
  if (deferredReason) {
    if (lastAutonomyDeferredReason !== deferredReason) {
      lastAutonomyDeferredReason = deferredReason;
      recordActivity('autonomy_goal.deferred', {
        reason: deferredReason,
        onGround: bot.entity.onGround,
        hasGoal: Boolean(bot.pathfinder.goal),
        isMoving: isPathfinderMoving
      });
      console.info(`[autonomy] Goal deferred: ${deferredReason}`);
    }
    return;
  }

  void performAutonomyAction(currentAutonomyGoal);
}

async function performAutonomyAction(objective) {
  let goal;
  let targetBlock;
  const origin = bot.entity.position.floored();

  if (objective.kind === 'explore') {
    const offset = getIdleWanderOffset(idleWanderRadius);
    goal = new GoalNear(origin.x + offset.x, origin.y, origin.z + offset.z, 1);
  } else if (objective.kind === 'visit_player') {
    const playerEntity = findPlayerByName(objective.targetName)?.[1]?.entity;
    if (!playerEntity) {
      autonomyGoalComplete = true;
      recordActivity('autonomy_goal.skipped', { goal: objective.kind, reason: 'player_not_nearby' });
      return;
    }
    if (origin.distanceTo(playerEntity.position) <= 2) {
      autonomyGoalComplete = true;
      recordActivity('autonomy_goal.completed', { goal: objective.kind });
      return;
    }
    goal = new GoalNear(playerEntity.position.x, playerEntity.position.y, playerEntity.position.z, 2);
  } else if (objective.kind === 'visit_animal') {
    const animal = bot.entities[objective.entityId];
    if (!animal?.position) {
      autonomyGoalComplete = true;
      recordActivity('autonomy_goal.skipped', { goal: objective.kind, reason: 'animal_not_nearby' });
      return;
    }
    if (origin.distanceTo(animal.position) <= 2) {
      autonomyGoalComplete = true;
      recordActivity('autonomy_goal.completed', { goal: objective.kind });
      return;
    }
    goal = new GoalNear(animal.position.x, animal.position.y, animal.position.z, 2);
  } else if (objective.kind === 'visit_cushion') {
    targetBlock = bot.blockAt(objective.blockPosition);
    if (!targetBlock || origin.distanceTo(targetBlock.position) <= 1) {
      autonomyGoalComplete = true;
      if (targetBlock) {
        await bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5));
        await bot.activateBlock(targetBlock);
      }
      recordActivity('autonomy_goal.completed', { goal: objective.kind });
      return;
    }
    goal = new GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1);
  }

  const generation = ++autonomyGeneration;
  autonomyActive = true;
  recordActivity('autonomy_action.started', { goal: objective.kind });
  void bot.pathfinder.goto(goal)
    .then(async () => {
      if (generation !== autonomyGeneration) return;
      bot.pathfinder.setGoal(null);
      if (objective.kind !== 'explore') {
        autonomyGoalComplete = true;
        if (objective.kind === 'visit_cushion') {
          const block = bot.blockAt(objective.blockPosition);
          if (block) {
            await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
            await bot.activateBlock(block);
          }
        }
        recordActivity('autonomy_goal.completed', { goal: objective.kind });
      } else {
        recordActivity('autonomy_action.completed', { goal: objective.kind });
      }
    })
    .catch((error) => {
      if (generation === autonomyGeneration) {
        if (objective.kind !== 'explore') autonomyGoalComplete = true;
        recordActivity('autonomy_action.failed', { goal: objective.kind, reason: error.message });
        console.warn('[autonomy] Action stopped:', error.message);
      }
    })
    .finally(() => {
      if (generation === autonomyGeneration) autonomyActive = false;
    });
}

async function lookAtPlayer(username) {
  const target = findPlayerByName(username)?.[1]?.entity;
  if (!target || bot._client.ended) return;

  try {
    const eyeTarget = target.position.offset(0, (target.height ?? 1.8) * 0.75, 0);
    await bot.lookAt(eyeTarget);
  } catch (error) {
    if (!bot._client.ended) console.warn('[look] Could not face player:', error.message);
  }
}

async function holdItem(username, query) {
  const item = findInventoryItem(bot.inventory.items(), query);
  if (!item) {
    bot.chat(query ? `${query}はインベントリに見つからないよ。` : 'インベントリに持てるアイテムがないよ。');
    return;
  }

  try {
    await bot.equip(item, 'hand');
    recordActivity('item.equipped', { actor: username, item: item.name, count: item.count });
    bot.chat(`${item.displayName ?? item.name}を手に持ったよ。`);
  } catch (error) {
    recordActivity('item.equip_failed', { actor: username, item: item.name, reason: error.message });
    console.error('[inventory] Could not equip item:', error);
    bot.chat('そのアイテムを手に持てなかったよ。');
  }
}

function dispatchAction(username, action) {
  recordActivity('action.requested', { actor: username, action });
  console.info(`[action] ${username}: ${action}`);
  if (action === 'come') {
    void moveToPlayer(username);
  } else if (action === 'stop') {
    stopCurrentWork();
  } else if (action === 'build') {
    void buildHut();
  }
}

async function moveToPlayer(username) {
  if (activeBuild) {
    recordActivity('movement.rejected', { actor: username, reason: 'build_active' });
    bot.chat('建築中だよ。先に !stop で作業を止めてね。');
    return;
  }

  const playerEntry = findPlayerByName(username);
  const targetName = playerEntry?.[0] ?? username;
  const target = playerEntry?.[1]?.entity;
  if (!target) {
    recordActivity('movement.failed', { actor: username, reason: 'player_entity_not_found' });
    console.warn('[pathfinder] Player entity not found:', username);
    bot.chat(`${username}の姿が見えないから、そこへ行けないよ。`);
    return;
  }

  const generation = ++movementGeneration;
  const botPosition = bot.entity.position.floored();
  const targetPosition = target.position.floored();
  recordActivity('movement.started', {
    actor: username,
    target: targetName,
    from: { x: botPosition.x, y: botPosition.y, z: botPosition.z },
    destination: { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }
  });
  bot.chat(`ぼくの座標: ${botPosition.x}, ${botPosition.y}, ${botPosition.z}。${targetName}の座標: ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}。今から向かうよ。`);
  const goal = new GoalNear(targetPosition.x, targetPosition.y, targetPosition.z, 1);

  try {
    await bot.pathfinder.goto(goal);
    recordActivity('movement.completed', { actor: username, target: targetName });
    if (generation === movementGeneration) bot.chat(`${targetName}のところに着いたよ。`);
  } catch (error) {
    if (generation === movementGeneration) {
      recordActivity('movement.failed', { actor: username, target: targetName, reason: error.message });
      console.error('Pathfinding failed:', error);
      bot.chat('道が見つからなくて、そこまで行けなかったよ。');
    }
  }
}

function stopCurrentWork() {
  recordActivity('work.stopped');
  movementGeneration += 1;
  bot.pathfinder.setGoal(null);
  bot.stopDigging();
  bot.stopUsingItem();
  if (activeBuild) activeBuild.cancelled = true;
  bot.chat('移動と作業を止めるよ。');
}

function createHutPlan(origin) {
  const plan = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let z = -1; z <= 1; z += 1) plan.push(origin.offset(x, 0, z));
  }

  for (const y of [1, 2]) {
    for (let x = -1; x <= 1; x += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const isWall = Math.abs(x) === 1 || Math.abs(z) === 1;
        const isDoorway = x === -1 && z === 0;
        if (isWall && !isDoorway) plan.push(origin.offset(x, y, z));
      }
    }
  }

  for (let x = -1; x <= 1; x += 1) {
    for (let z = -1; z <= 1; z += 1) {
      if (x !== 0 || z !== 0) plan.push(origin.offset(x, 3, z));
    }
  }
  plan.push(origin.offset(0, 3, 0));
  return plan;
}

function findWoodPlanks() {
  return bot.inventory.items().find((item) => item.name.endsWith('_planks'));
}

function findPlacementReference(position) {
  const offsets = [
    [0, -1, 0], [0, 0, -1], [0, 0, 1],
    [-1, 0, 0], [1, 0, 0], [0, 1, 0]
  ];

  for (const [x, y, z] of offsets) {
    const block = bot.blockAt(position.offset(x, y, z));
    if (block?.boundingBox === 'block') return block;
  }
  return null;
}

async function buildHut() {
  if (activeBuild) {
    recordActivity('build.rejected', { reason: 'already_running' });
    bot.chat('もう建築中だよ。');
    return;
  }

  const build = { cancelled: false };
  activeBuild = build;
  recordActivity('build.started');

  try {
    const origin = bot.entity.position.floored().offset(2, 0, 0);
    const plan = createHutPlan(origin);
    const plankCount = bot.inventory.items()
      .filter((item) => item.name.endsWith('_planks'))
      .reduce((total, item) => total + item.count, 0);
    const missingPlanks = calculateShortfall(plan.length, plankCount);

    if (missingPlanks > 0) {
      recordActivity('build.rejected', {
        reason: 'insufficient_planks',
        required: plan.length,
        available: plankCount,
        missing: missingPlanks
      });
      bot.chat(`板材があと${missingPlanks}個足りないよ！`);
      return;
    }

    for (const position of plan) {
      const block = bot.blockAt(position);
      if (!block || block.boundingBox !== 'empty') {
        recordActivity('build.rejected', {
          reason: 'obstructed',
          position: { x: position.x, y: position.y, z: position.z }
        });
        bot.chat('建築場所に障害物があるみたい。場所を空けてから試してね。');
        return;
      }
    }

    for (const position of plan.slice(0, 9)) {
      const ground = bot.blockAt(position.offset(0, -1, 0));
      if (ground?.boundingBox !== 'block') {
        recordActivity('build.rejected', { reason: 'invalid_ground' });
        bot.chat('地面が平らでないか、足場がないみたい。別の場所で試してね。');
        return;
      }
    }

    bot.chat('近くに小さな木の小屋を建てるよ。');
    for (let index = 0; index < plan.length; index += 1) {
      if (build.cancelled) {
        recordActivity('build.cancelled');
        bot.chat('建築を中止したよ。');
        return;
      }

      const plank = findWoodPlanks();
      const reference = findPlacementReference(plan[index]);
      if (!plank || !reference) throw new Error('No plank or supporting block available');

      await bot.equip(plank, 'hand');
      await bot.placeBlock(reference, plan[index].minus(reference.position));
    }
    recordActivity('build.completed', { blocks: plan.length });
    bot.chat('小屋が完成したよ！');
  } catch (error) {
    recordActivity('build.failed', { reason: error.message });
    console.error('Hut building failed:', error);
    bot.chat('建築に失敗したよ。足場や設置できる場所を確認してね。');
  } finally {
    if (activeBuild === build) activeBuild = undefined;
  }
}

async function replyWithGemini(username, message) {
  const now = Date.now();
  if (lastGeminiRequestAt !== undefined && now - lastGeminiRequestAt < 5000) return;
  lastGeminiRequestAt = now;

  recordActivity('gemini.requested', {
    actor: username,
    model: process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'
  });
  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL ?? 'gemini-3.8-flash',
      contents: `${username}: ${message}`,
      config: { systemInstruction }
    });
    const reply = formatChatResponse(response.text);

    if (reply) {
      recordActivity('gemini.response_sent', { actor: username });
      bot.chat(reply);
    }
  } catch (error) {
    const summary = getGeminiErrorSummary(error);
    recordActivity('gemini.request_failed', {
      actor: username,
      httpStatus: summary.httpStatus,
      apiStatus: summary.apiStatus
    });
    const statusLabel = summary.httpStatus ? `HTTP ${summary.httpStatus}` : error?.name ?? 'unknown';
    const apiStatus = summary.apiStatus ? ` ${summary.apiStatus}` : '';
    console.error(`[Gemini API ${statusLabel}${apiStatus}] ${summary.message}`);
    if (summary.retryDelay) console.error(`[Gemini API] Retry-After: ${summary.retryDelay}`);
    if (error?.stack) console.error(error.stack);
  }
}

bot.on('kicked', (reason) => {
  let readableReason;
  try {
    const ChatMessage = chatMessageFactory(bot.registry);
    readableReason = ChatMessage.fromNotch(reason).toString();
  } catch {
    readableReason = typeof reason === 'string' ? reason : JSON.stringify(reason, null, 2);
  }

  const message = readableReason || JSON.stringify(reason, null, 2);
  recordActivity('bot.kicked', { reason: message });
  console.error(`Bot was kicked: ${message}`);
});
bot.on('error', (error) => {
  recordActivity('bot.error', { message: error.message, code: error.code });
  console.error('Mineflayer error:', error);
});
bot.on('end', (reason) => {
  clearRuntimeTimers();
  recordActivity('bot.disconnected', { reason: String(reason ?? 'connection ended') });
  if (!shuttingDown) console.warn(`[connection] Disconnected: ${String(reason ?? 'unknown reason')}`);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearRuntimeTimers();
  console.info(`[shutdown] Received ${signal}; closing the Minecraft connection.`);
  recordActivity('bot.shutdown', { signal });

  try {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    bot.quit(`Process received ${signal}`);
  } catch (error) {
    console.error('[shutdown] Failed to close cleanly:', error);
    bot.end(`Process received ${signal}`);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
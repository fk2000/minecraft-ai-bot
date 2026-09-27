export function isCommandMessage(message) {
  return message.trimStart().startsWith('!');
}

export function normalizePlayerName(username) {
  return String(username).trim().toLowerCase();
}

export function isBotMentioned(message, botUsername) {
  const normalizedMessage = String(message).toLowerCase();
  const username = String(botUsername).trim();
  const aliases = new Set([
    username,
    username.split(/[_.\-\s]+/, 1)[0],
    'steve',
    'スティーブ'
  ]);

  return [...aliases].some((alias) => {
    if (!alias) return false;
    if (/^[a-z0-9_]+$/i.test(alias)) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9_])${escapedAlias}($|[^a-z0-9_])`, 'i').test(normalizedMessage);
    }
    return normalizedMessage.includes(alias.toLowerCase());
  });
}

export function getPlayerRole(username, botUsername, developerUsername) {
  const normalizedUsername = normalizePlayerName(username);
  if (normalizedUsername === normalizePlayerName(botUsername)) return 'bot';
  const developerUsernames = Array.isArray(developerUsername) ? developerUsername : [developerUsername];
  if (developerUsernames.some((name) => normalizedUsername === normalizePlayerName(name))) return 'developer';
  return 'player';
}

export function parseSystemChatMessage(message) {
  const match = /^([.@]?[A-Za-z0-9_]{1,16})\s?[>:\-»\]\)~]+\s(.*)$/.exec(message);
  return match ? { username: match[1], message: match[2] } : null;
}

export function isSystemAnnouncement(username, message) {
  const text = `${username} ${message}`;
  return /geyser[\s_-]*updater/i.test(text) ||
    /(?:最新です|最新の状態|コマンド一覧|利用可能なコマンド)/.test(message) ||
    /\b(?:up to date|command list|available commands)\b/i.test(message);
}

export function getGeminiErrorSummary(error) {
  let apiError = {};
  try {
    apiError = JSON.parse(error?.message)?.error ?? {};
  } catch {
    apiError = {};
  }

  const status = Number(error?.status ?? apiError.code);
  const retryInfo = apiError.details?.find((detail) => detail['@type']?.endsWith('RetryInfo'));
  return {
    httpStatus: Number.isFinite(status) ? status : null,
    apiStatus: apiError.status ?? null,
    message: apiError.message ?? error?.message ?? String(error),
    retryDelay: retryInfo?.retryDelay ?? null
  };
}

export function getRequestedAction(message) {
  const normalized = message.trim().toLowerCase();
  const command = normalized.split(/\s+/, 1)[0];
  const commandActions = {
    '!come': 'come',
    '!stop': 'stop',
    '!build': 'build'
  };

  if (commandActions[command]) return commandActions[command];
  if (normalized.includes('とまれ') || normalized.includes('止まれ')) return 'stop';
  if (/家(?:を)?建てて/.test(normalized)) return 'build';
  if (/(?:ここ|こっち)(?:に)?(?:来て|きて)/.test(normalized) || normalized.includes('ここに集合して')) return 'come';
  return null;
}

export function parseWorldCommand(message) {
  const normalized = message.trim().toLowerCase();
  const commandMatch = /^!(weather|difficulty)(?:\s+(\S+))?$/i.exec(normalized);
  let type;
  let rawValue;

  if (commandMatch) {
    type = commandMatch[1].toLowerCase();
    rawValue = commandMatch[2] ?? '';
  } else {
    const weatherMatch = /(?:(?:天気|天候)(?:を)?\s*)?(晴れ|晴天|快晴|雨|雨天|雷雨|雷)(?:に)?(?:して|変えて|お願い)/.exec(normalized);
    const difficultyMatch = /(?:難易度(?:を)?\s*)?(peaceful|easy|normal|hard|ピースフル|平和|イージー|簡単|ノーマル|普通|ハード|難しい)(?:に)?(?:して|変えて|設定して|お願い)/.exec(normalized);
    if (weatherMatch) {
      type = 'weather';
      rawValue = weatherMatch[1];
    } else if (difficultyMatch) {
      type = 'difficulty';
      rawValue = difficultyMatch[1];
    } else {
      return null;
    }
  }

  const weatherValues = new Map([
    ['clear', 'clear'], ['sunny', 'clear'], ['晴れ', 'clear'], ['晴天', 'clear'], ['快晴', 'clear'],
    ['rain', 'rain'], ['雨', 'rain'], ['雨天', 'rain'],
    ['thunder', 'thunder'], ['雷雨', 'thunder'], ['雷', 'thunder']
  ]);
  const difficultyValues = new Map([
    ['peaceful', 'peaceful'], ['ピースフル', 'peaceful'], ['平和', 'peaceful'],
    ['easy', 'easy'], ['イージー', 'easy'], ['簡単', 'easy'],
    ['normal', 'normal'], ['ノーマル', 'normal'], ['普通', 'normal'],
    ['hard', 'hard'], ['ハード', 'hard'], ['難しい', 'hard']
  ]);

  return {
    type,
    value: (type === 'weather' ? weatherValues : difficultyValues).get(rawValue) ?? null
  };
}

export function calculateShortfall(required, available) {
  return Math.max(0, required - available);
}

export function findInventoryItem(items, query = '') {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalizedQuery) return items[0] ?? null;

  return items.find((item) =>
    item.name.toLowerCase().includes(normalizedQuery) ||
    item.displayName?.toLowerCase().includes(query.trim().toLowerCase())
  ) ?? null;
}

export function getIdleWanderOffset(radius, random = Math.random) {
  const safeRadius = Math.max(1, Math.floor(radius));
  const nextOffset = () => Math.floor(random() * (safeRadius * 2 + 1)) - safeRadius;
  const offsetX = nextOffset();
  let offsetZ = nextOffset();
  if (offsetX === 0 && offsetZ === 0) offsetZ = 1;
  return { x: offsetX, z: offsetZ };
}

export function chooseRandomAutonomyGoal(goals, random = Math.random) {
  if (goals.length === 0) return null;
  const index = Math.min(goals.length - 1, Math.floor(random() * goals.length));
  return goals[index];
}

export function findBlockIdsMatchingNames(blocksByName, names) {
  const filters = names.map((name) => name.trim().toLowerCase()).filter(Boolean);
  return Object.entries(blocksByName)
    .filter(([name]) => filters.some((filter) => name.toLowerCase().includes(filter)))
    .map(([, block]) => block.id);
}

export function formatChatResponse(response) {
  return String(response ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 256);
}
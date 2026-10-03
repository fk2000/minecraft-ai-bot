export type BotCommand =
  | { type: 'help' }
  | { type: 'ping' }
  | { type: 'come' }
  | { type: 'stop' }
  | { type: 'build' }
  | { type: 'goals' }
  | { type: 'goal'; choice: 'survive' | 'socialize' | 'explore' | 'observe' | 'rest' | null }
  | { type: 'hold'; query: string }
  | { type: 'weather'; value: string | null }
  | { type: 'difficulty'; value: string | null }
  | { type: 'unsupported'; name: string };

const goalChoices: Record<string, Extract<BotCommand, { type: 'goal' }>['choice']> = {
  survive: 'survive',
  生存: 'survive',
  socialize: 'socialize',
  交流: 'socialize',
  explore: 'explore',
  探索: 'explore',
  observe: 'observe',
  観察: 'observe',
  rest: 'rest',
  待機: 'rest'
};

export function parseBotCommand(message: string): BotCommand | null {
  const match = /^!(\S+)(?:\s+([\s\S]*))?$/.exec(message.trim());
  if (!match) return null;

  const name = match[1].toLowerCase();
  const argument = match[2]?.trim() ?? '';
  switch (name) {
    case 'help':
      return { type: 'help' };
    case 'ping':
      return { type: 'ping' };
    case 'come':
      return { type: 'come' };
    case 'stop':
      return { type: 'stop' };
    case 'build':
      return { type: 'build' };
    case 'goals':
      return { type: 'goals' };
    case 'goal':
      return { type: 'goal', choice: goalChoices[argument.toLowerCase()] ?? null };
    case 'hold':
      return { type: 'hold', query: argument };
    case 'weather':
      return { type: 'weather', value: argument ? argument.toLowerCase() : null };
    case 'difficulty':
      return { type: 'difficulty', value: argument ? argument.toLowerCase() : null };
    default:
      return { type: 'unsupported', name: match[1] };
  }
}

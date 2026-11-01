export type BuildTrickId = 'trick1' | 'trick2' | 'trick3' | 'trick4' | 'trick5';
export type BuildTarget = BuildTrickId | 'hut' | 'list';

export type BotCommand =
  | { type: 'help' }
  | { type: 'ping' }
  | { type: 'come' }
  | { type: 'stop' }
  | { type: 'build'; trick: BuildTarget | null }
  | { type: 'goals' }
  | { type: 'goal'; choice: 'survive' | 'socialize' | 'explore' | 'observe' | 'rest' | null }
  | { type: 'hold'; query: string }
  | { type: 'weather'; value: string | null }
  | { type: 'difficulty'; value: string | null }
  | { type: 'unsupported'; name: string };

const buildTrickAliases: Record<string, BuildTrickId> = {
  'trick1': 'trick1',
  '1': 'trick1',
  'トリック1': 'trick1',
  'イルミ': 'trick1',
  'イルミネーション': 'trick1',
  '電飾': 'trick1',
  'stringlights': 'trick1',
  
  'trick2': 'trick2',
  '2': 'trick2',
  'トリック2': 'trick2',
  '花': 'trick2',
  '植物': 'trick2',
  '葉っぱ花': 'trick2',
  'flower': 'trick2',
  
  'trick3': 'trick3',
  '3': 'trick3',
  'トリック3': 'trick3',
  '窓': 'trick3',
  '屋根': 'trick3',
  'window': 'trick3',
  
  'trick4': 'trick4',
  '4': 'trick4',
  'トリック4': 'trick4',
  'アーチ': 'trick4',
  '門': 'trick4',
  'arch': 'trick4',
  
  'trick5': 'trick5',
  '5': 'trick5',
  'トリック5': 'trick5',
  '道': 'trick5',
  '光る道': 'trick5',
  'path': 'trick5',
  'redpath': 'trick5',
};

export function parseBuildTrickArg(arg: string): BuildTarget | null {
  const normalized = arg.trim().toLowerCase();
  if (normalized === '' || normalized === 'list' || normalized === '一覧' || normalized === 'help') {
    return 'list';
  }
  if (normalized === 'hut' || normalized === '小屋' || normalized === 'こや') {
    return 'hut';
  }
  return buildTrickAliases[normalized] ?? null;
}

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
      return { type: 'build', trick: parseBuildTrickArg(argument) };
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

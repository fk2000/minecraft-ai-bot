export type MinecraftDifficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

export interface DifficultyCommand {
  value: MinecraftDifficulty | null;
}

const difficultyValues: Record<string, MinecraftDifficulty> = {
  peaceful: 'peaceful',
  ピースフル: 'peaceful',
  平和: 'peaceful',
  easy: 'easy',
  イージー: 'easy',
  簡単: 'easy',
  normal: 'normal',
  ノーマル: 'normal',
  普通: 'normal',
  hard: 'hard',
  ハード: 'hard',
  難しい: 'hard'
};

export function parseDifficultyCommand(message: string): DifficultyCommand | null {
  const normalized = message.trim().toLowerCase();
  const commandMatch = /^!difficulty(?:\s+(\S+))?$/i.exec(normalized);
  if (commandMatch) {
    return { value: difficultyValues[commandMatch[1] ?? ''] ?? null };
  }

  const naturalMatch =
    /^(?:難易度(?:を)?\s*)?(peaceful|easy|normal|hard|ピースフル|平和|イージー|簡単|ノーマル|普通|ハード|難しい)(?:に)?(?:して|変えて|設定して|お願い)$/.exec(normalized);
  if (!naturalMatch) return null;

  return { value: difficultyValues[naturalMatch[1]] ?? null };
}

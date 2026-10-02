export interface JevCommand {
  instruction: string;
}

export function parseJevCommand(message: string): JevCommand | null {
  const match = /^\s*jev\s*:\s*(.*)$/i.exec(message);
  return match ? { instruction: match[1].trim() } : null;
}

/** Pure parsing of a Telegram message into a bot command. */
export type ParsedCommand = { command: string; args: string[] };

export function parseCommand(text: string | undefined | null): ParsedCommand | null {
  const trimmed = text?.trim();
  if (!trimmed?.startsWith("/")) return null;
  const [head = "", ...args] = trimmed.split(/\s+/);
  // "/today@FyndueBot" → "today"
  const command = head.slice(1).split("@")[0]!.toLowerCase();
  if (!/^[a-z_]{1,32}$/.test(command)) return null;
  return { command, args };
}

/**
 * A warning for commands that can destroy data or stop a server, shown on the confirmation card when the assistant wants to
 * run one. Pure: it only reads the text. **It is a reminder, not a wall**: a determined or lucky command gets past any
 * pattern list, and the user stays the one who decides (every command needs their tap, and a risky one cannot be agreed
 * to by voice). The patterns are cautious on purpose: a false alarm costs a second look, a miss costs a server.
 */
export type CommandAssessment = {
  /** English texts (translation keys, see lib/i18n/ssh.ts) of what the command may do; empty = nothing recognised. */
  risks: string[];
  /** The command runs several commands in a row (`;`, `&&`, `||`, a new line or a pipe into a shell). */
  chained: boolean;
};

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\brm\s+(?:-\S*[rf]\S*|--recursive|--force)\b/i, "It deletes files, possibly a whole folder."],
  [/\b(?:dd\b[^|;&\n]*\bof=|mkfs(?:\.\w+)?\b|wipefs\b|fdisk\b|sfdisk\b|parted\b)/i, "It writes straight to a disk or changes its partitions."],
  [/>\s*\/dev\/(?:sd|hd|vd|nvme|mmcblk)/i, "It writes straight to a disk or changes its partitions."],
  [/\b(?:shutdown|reboot|halt|poweroff)\b|\binit\s+[06]\b|\bsystemctl\s+(?:poweroff|reboot|halt)\b/i, "It shuts down or restarts the server."],
  [/\bsystemctl\s+(?:stop|disable|mask|kill)\b|\bservice\s+\S+\s+stop\b/i, "It stops or disables a service."],
  [/\b(?:kill\s+-9|killall|pkill)\b/i, "It forcibly stops processes."],
  [/\b(?:chmod|chown|chgrp)\s+(?:-\S*R\S*|--recursive)\b/, "It changes permissions or owners of a whole folder."],
  [/\b(?:curl|wget)\b[^|;&\n]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i, "It runs a script downloaded from the internet."],
  [/\bdrop\s+(?:database|table|schema)\b|\btruncate\s+table\b|\bdelete\s+from\s+\w+\s*(?:;|$)/i, "It deletes a database, a table or all its rows."],
  [/\bdocker\s+(?:system\s+prune|volume\s+(?:rm|prune)|rmi?\s+-f|compose\s+down\s+(?:-v|--volumes))\b/i, "It removes containers, images or their data."],
  [/\bgit\s+(?:reset\s+--hard|clean\s+-\S*f|push\s+(?:-f\b|--force))/i, "It discards work or rewrites history."],
  [/>\s*\/etc\//i, "It overwrites a system configuration file."],
  [/:\s*\(\s*\)\s*\{/, "It looks like a fork bomb that would freeze the server."],
];

const CHAIN = /;|&&|\|\||\n|\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/;

export function assessCommand(command: string): CommandAssessment {
  const risks: string[] = [];
  for (const [pattern, text] of RULES) {
    if (pattern.test(command) && !risks.includes(text)) risks.push(text);
  }
  return { risks, chained: CHAIN.test(command.trim()) };
}

/** Every risk text, for the translation check. */
export const RISK_TEXTS: readonly string[] = [...new Set(RULES.map(([, text]) => text))];

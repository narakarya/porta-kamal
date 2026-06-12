export function shellQuote(value) {
  const s = String(value);
  if (s === "") return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s)) return s;
  return "'" + s.replaceAll("'", "'\"'\"'") + "'";
}

export function shellJoin(parts) {
  return parts.map(shellQuote).join(" ");
}

export function loginShellCommand(command) {
  return `/bin/zsh -lic ${shellQuote(command)}`;
}

export function parseAliasCommand(output, name) {
  const prefix = `${name}=`;
  const line = String(output).split("\n").find((l) => l === name || l.startsWith(prefix) || l.startsWith(`alias ${prefix}`));
  if (!line) return null;
  let value = line.startsWith("alias ") ? line.slice("alias ".length) : line;
  if (!value.startsWith(prefix)) return null;
  value = value.slice(prefix.length).trim();
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value || null;
}

export function stripDockerTty(command) {
  return String(command)
    .replace(/(^|\s)-(it|ti)(?=\s|$)/g, "$1-i")
    .replace(/(^|\s)-t(?=\s|$)/g, "$1")
    .replace(/(^|\s)--tty(?=\s|$)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function commandWithArgs(command, args) {
  return [command, shellJoin(args)].filter(Boolean).join(" ");
}

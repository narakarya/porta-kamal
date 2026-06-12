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

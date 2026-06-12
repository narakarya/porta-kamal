(function () {

// lib/shell.js
function shellQuote(value) {
  const s = String(value);
  if (s === "") return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s)) return s;
  return "'" + s.replaceAll("'", "'\"'\"'") + "'";
}

function shellJoin(parts) {
  return parts.map(shellQuote).join(" ");
}

function loginShellCommand(command) {
  return `/bin/zsh -lic ${shellQuote(command)}`;
}

function parseAliasCommand(output, name) {
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

function stripDockerTty(command) {
  return String(command)
    .replace(/(^|\s)-(it|ti)(?=\s|$)/g, "$1-i")
    .replace(/(^|\s)-t(?=\s|$)/g, "$1")
    .replace(/(^|\s)--tty(?=\s|$)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeDockerKamalCommand(command) {
  let normalized = stripDockerTty(command);
  normalized = normalized.replace(
    /-v\s+"\$\{SSH_AUTH_SOCK\}:\/ssh-agent"\s+-e\s+SSH_AUTH_SOCK="\/ssh-agent"/g,
    '${SSH_AUTH_SOCK:+-v "${SSH_AUTH_SOCK}:/ssh-agent" -e SSH_AUTH_SOCK="/ssh-agent"}',
  );
  if (normalized.includes(":/workdir") && !/(^|\s)-w\s+\/workdir(?=\s|$)/.test(normalized)) {
    normalized = normalized.replace(
      /(ghcr\.io\/basecamp\/kamal(?::[^\s]+)?)/,
      "-w /workdir $1",
    );
  }
  return normalized.replace(/\s{2,}/g, " ").trim();
}

function commandWithArgs(command, args) {
  return [command, shellJoin(args)].filter(Boolean).join(" ");
}


// lib/workdir.js
// Mirrors Rust kamal_work_dir(): config/deploy.yml resolves to the project root.
function kamalWorkDir(configPath) {
  if (configPath.endsWith("/config/deploy.yml")) {
    return configPath.split("/").slice(0, -2).join("/") || "/";
  }
  return configPath.split("/").slice(0, -1).join("/") || "/";
}


// lib/accessories.js
// Returns the keys of the top-level `accessories:` mapping in a kamal deploy.yml.
// Minimal YAML-subset scan (no external parser): find the column-0
// `accessories:` line, then collect immediate child keys (the first deeper
// indentation level) until indentation returns to column 0.
function parseAccessories(yamlText) {
  const lines = String(yamlText).split("\n");
  let i = 0;
  for (; i < lines.length; i++) {
    if (/^accessories:\s*(#.*)?$/.test(lines[i])) break;
  }
  if (i >= lines.length) return [];
  i++;
  const names = [];
  let childIndent = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line)) continue;             // skip blank
    if (/^\s*#/.test(line)) continue;             // skip comment lines
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break;                       // back to top level → done
    if (childIndent === null) childIndent = indent;
    if (indent !== childIndent) continue;          // deeper (accessory props) → skip
    const m = line.trimStart().match(/^([A-Za-z0-9_-]+):/);
    if (m) names.push(m[1]);
  }
  return names;
}


// lib/commands.js
// Ported verbatim from DeployModal.tsx FIXED_COMMANDS.
const FIXED_COMMANDS = [
  { id: "deploy",        label: "Deploy",       args: ["deploy"],                               group: "Deploy",  confirm: true },
  { id: "rollback",      label: "Rollback",     args: ["rollback"],                             group: "Deploy",  confirm: true },
  { id: "lock-release",  label: "Release Lock", args: ["lock", "release"],                      group: "Deploy",  confirm: true },
  { id: "app-logs",      label: "App Logs",     args: ["app", "logs"],                          group: "App",     safe: true },
  { id: "app-details",   label: "Details",      args: ["app", "details"],                       group: "App",     safe: true },
  { id: "app-start",     label: "Start",        args: ["app", "start"],                         group: "App" },
  { id: "app-stop",      label: "Stop",         args: ["app", "stop"],                          group: "App" },
  { id: "app-restart",   label: "Restart",      args: ["app", "restart"],                       group: "App",     confirm: true },
  { id: "server-reboot", label: "Server Reboot", args: ["server", "reboot"],                    group: "Server",  confirm: true },
  { id: "server-exec",   label: "Server Info",  args: ["server", "exec", "hostname && uname -a"], group: "Server", safe: true },
  { id: "audit",         label: "Audit",        args: ["audit"],                                group: "Debug",   safe: true },
  { id: "version",       label: "Version",      args: ["version"],                              group: "Debug",   safe: true },
];

function buildAccessoryCommands(names) {
  return names.flatMap((name) => [
    { id: `acc-logs-${name}`, label: `${name}: logs`, args: ["accessory", "logs", name], group: "Accessories", safe: true },
  ]);
}

function groupCommands(commands) {
  const groups = new Map();
  for (const cmd of commands) {
    if (!groups.has(cmd.group)) groups.set(cmd.group, []);
    groups.get(cmd.group).push(cmd);
  }
  return groups;
}


// lib/custom.js
const KEY = "customCommands";

class CustomStore {
  constructor(storage) { this.storage = storage; }

  async list() {
    const v = await this.storage.get(KEY);
    return Array.isArray(v) ? v : [];
  }
  async add({ label, args, interactive }) {
    const list = await this.list();
    list.push({ id: crypto.randomUUID(), label, args, interactive: !!interactive });
    await this.storage.set(KEY, list);
  }
  async update(id, { label, args, interactive }) {
    const list = await this.list();
    const i = list.findIndex((c) => c.id === id);
    if (i === -1) return;
    list[i] = { id, label, args, interactive: !!interactive };
    await this.storage.set(KEY, list);
  }
  async remove(id) {
    const list = (await this.list()).filter((c) => c.id !== id);
    await this.storage.set(KEY, list);
  }
  toCommandDefs(list) {
    return list.map((c) => ({
      id: `custom-${c.id}`,
      label: c.label,
      args: c.args,
      group: "Custom",
      interactive: c.interactive,
    }));
  }
}


// lib/config.js

async function exists(runShell, path) {
  const r = await runShell(`test -f ${shellQuote(path)}`);
  return r.code === 0;
}

// runShell(cmd) → {code}. Returns the resolved config path or null.
async function detectConfigPath(runShell, rootDir, override) {
  if (override && (await exists(runShell, override))) return override;
  const candidates = [`${rootDir}/config/deploy.yml`, `${rootDir}/deploy.yml`];
  for (const c of candidates) {
    if (await exists(runShell, c)) return c;
  }
  return null;
}


// app.js

const bridge = window.portaBridge;
const $ = (id) => document.getElementById(id);

if (!bridge) {
  document.body.textContent = "Missing portaBridge. Reload the extension.";
  throw new Error("kamal: no portaBridge");
}

const sidebarEl = $("sidebar");
const statusEl = $("status-bar");
const outputHostEl = $("output-host");

const APP_VERSION = "0.2.3";
const rootDir = bridge.app.rootDir;
const custom = new CustomStore(bridge.storage);
const runShell = (cmd, opts = {}) => bridge.shell.run(loginShellCommand(cmd), opts);
const spawnShell = (cmd, opts = {}, callbacks = {}) => {
  const wrapped = loginShellCommand(cmd);
  if (bridge.shell.spawn) return bridge.shell.spawn(wrapped, opts, callbacks);
  return bridge.shell.run(wrapped, opts).then((result) => {
    for (const line of (result.stdout || "").split("\n").filter(Boolean)) callbacks.onStdout?.(line);
    for (const line of (result.stderr || "").split("\n").filter(Boolean)) callbacks.onStderr?.(line);
    return result;
  });
};

const SEARCH_THRESHOLD = 12;
const COMMAND_TIMEOUT = 15 * 60 * 1000;
const INSTALL_CMD =
  'if [ -w "$(gem env gemdir 2>/dev/null)" ]; then gem install kamal; else gem install kamal --user-install; fi';

const state = {
  installed: false,
  version: null,
  kamalCommand: "kamal",
  kamalDisplay: "kamal",
  configPath: null,
  workDir: rootDir,
  accessories: [],
  commands: [],
  search: "",
  selectedId: null,
  editingCustomId: null,
  run: null,
};
let runCounter = 0;

bridge.ui.setTitle("Kamal - " + bridge.app.name);

async function checkKamal() {
  const alias = await runShell("alias kamal 2>/dev/null || true");
  const aliasCommand = parseAliasCommand(alias.stdout || alias.stderr || "", "kamal");
  if (aliasCommand) {
    state.installed = true;
    state.kamalCommand = normalizeDockerKamalCommand(aliasCommand);
    state.kamalDisplay = "kamal";
    state.version = aliasCommand.includes("docker run") ? "docker image" : "alias";
    return;
  }

  const found = await runShell("command -v kamal");
  const path = (found.stdout || "").trim().split("\n").pop() || "";
  state.installed = found.code === 0 && !!path;
  if (!state.installed) {
    state.version = null;
    state.kamalCommand = "kamal";
    state.kamalDisplay = "kamal";
    return;
  }
  state.kamalCommand = "kamal";
  state.kamalDisplay = "kamal";

  const version = await runShell("kamal version 2>/dev/null || kamal --version 2>/dev/null || true");
  const label = ((version.stdout || version.stderr || "").trim().split("\n").pop() || path).trim();
  state.version = label.replace(/^kamal\s+/i, "");
}

async function loadConfig() {
  const override = await bridge.storage.get("configPathOverride");
  const ovr = typeof override === "string" && override ? override : null;
  state.configPath = await detectConfigPath(runShell, rootDir, ovr);
  if (state.configPath) {
    state.workDir = kamalWorkDir(state.configPath);
    const cat = await runShell(`cat ${shellQuote(state.configPath)}`);
    state.accessories = cat.code === 0 ? parseAccessories(cat.stdout) : [];
  } else {
    state.workDir = rootDir;
    state.accessories = [];
  }
}

async function rebuildCommands() {
  const customDefs = custom.toCommandDefs(await custom.list());
  state.commands = [...FIXED_COMMANDS, ...buildAccessoryCommands(state.accessories), ...customDefs];
}

function kamalCommandLine(cmd) {
  return commandWithArgs(state.kamalCommand, cmd.args);
}

function kamalDisplayLine(cmd) {
  return shellJoin([state.kamalDisplay, ...cmd.args]);
}

function isRunning() {
  return state.run && state.run.status === "running";
}

async function runCommand(cmd) {
  if (isRunning()) {
    bridge.ui.toast("A command is still running", "info");
    return;
  }
  state.selectedId = cmd.id;
  await runTask({
    title: cmd.label,
    command: kamalCommandLine(cmd),
    displayCommand: kamalDisplayLine(cmd),
    timeout: COMMAND_TIMEOUT,
  });
  renderSidebar();
}

async function installKamal() {
  if (isRunning()) {
    bridge.ui.toast("A command is still running", "info");
    return;
  }
  await runTask({
    title: "Install Kamal",
    command: INSTALL_CMD,
    timeout: COMMAND_TIMEOUT,
    onDone: async () => {
      await checkKamal();
      renderStatus();
    },
  });
}

async function runTask({ title, command, displayCommand, timeout, onDone }) {
  const id = ++runCounter;
  state.run = {
    id,
    title,
    command,
    displayCommand: displayCommand || command,
    cwd: state.workDir,
    status: "running",
    code: null,
    timedOut: false,
    stdout: [],
    stderr: [],
    output: [],
    error: null,
    startedAt: new Date(),
    finishedAt: null,
  };
  renderStatus();
  renderOutput();

  const append = (channel, line) => {
    if (!state.run || state.run.id !== id) return;
    state.run[channel].push(line);
    state.run.output.push({ channel, line });
    renderOutput();
  };

  try {
    const result = await spawnShell(command, { cwd: state.workDir, timeout }, {
      onStdout: (line) => append("stdout", line),
      onStderr: (line) => append("stderr", line),
    });
    if (!state.run || state.run.id !== id) return;
    state.run.code = result.code;
    state.run.timedOut = !!result.timed_out;
    state.run.status = result.code === 0 && !result.timed_out ? "success" : "failed";
    state.run.finishedAt = new Date();
    bridge.ui.toast(
      state.run.status === "success" ? `${title} finished` : `${title} failed`,
      state.run.status === "success" ? "success" : "error",
    );
  } catch (err) {
    if (!state.run || state.run.id !== id) return;
    state.run.status = "failed";
    state.run.error = err && err.message ? err.message : String(err);
    state.run.finishedAt = new Date();
    bridge.ui.toast(`${title} failed: ${state.run.error}`, "error");
  } finally {
    if (state.run && state.run.id === id) {
      await (onDone ? onDone() : undefined);
      renderStatus();
      renderOutput();
    }
  }
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) node.append(c);
  return node;
}

function renderStatus() {
  statusEl.innerHTML = "";
  const left = el("div", { className: "status-left" });
  if (state.installed) {
    left.append(el("span", { className: "kamal-version", textContent: "kamal " + (state.version || "installed") }));
  } else {
    left.append(el("span", { className: "kamal-missing", textContent: "kamal not found" }));
    const btn = el("button", { className: "btn", textContent: "Install Kamal" });
    btn.onclick = installKamal;
    left.append(btn);
  }
  const recheck = el("button", { className: "btn", textContent: "Re-check" });
  recheck.onclick = async () => { await checkKamal(); renderStatus(); };
  left.append(recheck);

  const right = el("div", { className: "status-right" });
  right.append(el("span", { className: "cfg-pill", textContent: "v" + APP_VERSION }));
  if (state.configPath) {
    right.append(el("span", { className: "cfg-pill", title: state.configPath, textContent: state.configPath.replace(rootDir + "/", "") }));
  }
  if (isRunning()) {
    right.append(el("span", { className: "run-pill running", textContent: "Running" }));
  }
  statusEl.append(left, right);
}

function renderOutput() {
  outputHostEl.innerHTML = "";
  const run = state.run;
  if (!run) {
    outputHostEl.append(
      el("div", { className: "empty-state" }, [
        el("div", { className: "empty-title", textContent: "Select a Kamal command" }),
        el("div", { className: "empty-copy", textContent: "Results, errors, and command output will appear here." }),
      ]),
    );
    return;
  }

  const header = el("div", { className: "output-header" });
  const title = el("div", { className: "output-title" }, [
    el("span", { textContent: run.title }),
    el("span", { className: "run-pill " + run.status, textContent: run.status }),
  ]);
  const meta = el("div", { className: "output-meta", textContent: run.displayCommand });
  header.title = run.displayCommand;
  header.append(title, meta);
  outputHostEl.append(header);

  if (run.error) outputHostEl.append(el("pre", { className: "output-block stderr", textContent: run.error }));
  const lines = run.output;
  if (lines.length === 0 && run.status === "running") {
    outputHostEl.append(el("div", { className: "output-wait", textContent: "Running command..." }));
    return;
  }
  if (lines.length === 0) {
    outputHostEl.append(el("div", { className: "output-wait", textContent: "No output." }));
    return;
  }
  const block = el("pre", { className: "output-block" });
  for (const entry of lines) {
    const row = el("div", { className: "output-line " + entry.channel, textContent: entry.line });
    block.append(row);
  }
  outputHostEl.append(block);
}

function commandMatches(cmd) {
  if (!state.search) return true;
  return cmd.label.toLowerCase().includes(state.search.toLowerCase());
}

function renderSidebar() {
  if (!state.configPath) {
    sidebarEl.innerHTML = "";
    sidebarEl.append(el("div", { className: "notice", textContent: "No deploy.yml found under " + rootDir }));
    const input = el("input", { className: "cfg-input", placeholder: "/path/to/deploy.yml" });
    const save = el("button", { className: "btn", textContent: "Set config path" });
    save.onclick = async () => {
      const v = input.value.trim();
      if (!v) return;
      await bridge.storage.set("configPathOverride", v);
      await reload();
    };
    sidebarEl.append(input, save);
    return;
  }

  let listEl = document.getElementById("sidebar-list");
  if (!listEl) {
    sidebarEl.innerHTML = "";
    if (state.commands.length >= SEARCH_THRESHOLD) {
      const search = el("input", {
        id: "sidebar-search", className: "search",
        placeholder: "Filter commands...", value: state.search,
      });
      search.oninput = (e) => { state.search = e.target.value; renderCommandList(); };
      sidebarEl.append(search);
    }
    listEl = el("div", { id: "sidebar-list" });
    sidebarEl.append(listEl);
  }
  renderCommandList();
}

function renderCommandList() {
  const listEl = document.getElementById("sidebar-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const groups = groupCommands(state.commands.filter(commandMatches));
  for (const [group, cmds] of groups) {
    listEl.append(el("div", { className: "group-header", textContent: group }));
    for (const cmd of cmds) {
      const row = el("div", {
        className: "cmd-row" + (cmd.id === state.selectedId ? " selected" : ""),
      });
      row.append(el("span", { className: "cmd-label", textContent: cmd.label }));
      row.onclick = () => runCommand(cmd);
      if (cmd.group === "Custom") {
        const id = cmd.id.replace(/^custom-/, "");
        const edit = el("button", { className: "icon-btn", textContent: "Edit", title: "Edit", type: "button" });
        edit.onclick = (e) => { e.stopPropagation(); openCustomForm(id); };
        const del = el("button", { className: "icon-btn", textContent: "Del", title: "Delete", type: "button" });
        del.onclick = async (e) => { e.stopPropagation(); await custom.remove(id); await rebuildCommands(); renderSidebar(); };
        row.append(edit, del);
      }
      listEl.append(row);
    }
  }

  const addCustom = el("button", { className: "btn add-custom", textContent: "+ Custom command", type: "button" });
  addCustom.onclick = () => openCustomForm("");
  listEl.append(addCustom);

  if (state.editingCustomId !== null) listEl.append(renderCustomForm());
}

let _editDraft = null;
async function openCustomForm(id) {
  state.editingCustomId = id;
  if (id) {
    const list = await custom.list();
    const found = list.find((c) => c.id === id);
    _editDraft = found ? { label: found.label, args: found.args.join(" ") } : { label: "", args: "" };
  } else {
    _editDraft = { label: "", args: "" };
  }
  renderSidebar();
}

function renderCustomForm() {
  const form = el("div", { className: "custom-form" });
  const label = el("input", { className: "cf-label", placeholder: "Label", value: _editDraft.label });
  const args = el("input", { className: "cf-args", placeholder: "args e.g. app logs", value: _editDraft.args });
  const save = el("button", { className: "btn", textContent: "Save", type: "button" });
  save.onclick = async () => {
    const payload = {
      label: label.value.trim(),
      args: args.value.trim().split(/\s+/).filter(Boolean),
      interactive: false,
    };
    if (!payload.label || payload.args.length === 0) return;
    if (state.editingCustomId) await custom.update(state.editingCustomId, payload);
    else await custom.add(payload);
    state.editingCustomId = null;
    await rebuildCommands();
    renderSidebar();
  };
  const cancel = el("button", { className: "btn", textContent: "Cancel", type: "button" });
  cancel.onclick = () => { state.editingCustomId = null; renderSidebar(); };
  form.append(label, args, save, cancel);
  return form;
}

async function reload() {
  await loadConfig();
  await rebuildCommands();
  renderStatus();
  sidebarEl.innerHTML = "";
  renderSidebar();
  renderOutput();
}

async function main() {
  try {
    renderStatus();
    renderOutput();
    sidebarEl.append(el("div", { className: "loading", textContent: "Loading..." }));
    await checkKamal();
    await reload();
  } catch (err) {
    sidebarEl.innerHTML = "";
    sidebarEl.append(el("div", { className: "notice", textContent: "Load failed: " + (err && err.message ? err.message : String(err)) }));
  }
}

main();


}());

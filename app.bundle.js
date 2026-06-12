(function () {
  function shellQuote(value) {
    var s = String(value);
    if (s === "") return "''";
    if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s)) return s;
    return "'" + s.replace(/'/g, "'\"'\"'") + "'";
  }

  function shellJoin(parts) {
    return parts.map(shellQuote).join(" ");
  }

  function loginShellCommand(command) {
    return "/bin/zsh -lic " + shellQuote(command);
  }

  function kamalWorkDir(configPath) {
    if (configPath.endsWith("/config/deploy.yml")) {
      return configPath.split("/").slice(0, -2).join("/") || "/";
    }
    return configPath.split("/").slice(0, -1).join("/") || "/";
  }

  function parseAccessories(yamlText) {
    var lines = String(yamlText).split("\n");
    var i = 0;
    for (; i < lines.length; i++) {
      if (/^accessories:\s*(#.*)?$/.test(lines[i])) break;
    }
    if (i >= lines.length) return [];
    i++;
    var names = [];
    var childIndent = null;
    for (; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*$/.test(line)) continue;
      if (/^\s*#/.test(line)) continue;
      var indent = line.length - line.trimStart().length;
      if (indent === 0) break;
      if (childIndent === null) childIndent = indent;
      if (indent !== childIndent) continue;
      var m = line.trimStart().match(/^([A-Za-z0-9_-]+):/);
      if (m) names.push(m[1]);
    }
    return names;
  }

  var FIXED_COMMANDS = [
    { id: "deploy", label: "Deploy", args: ["deploy"], group: "Deploy", confirm: true },
    { id: "rollback", label: "Rollback", args: ["rollback"], group: "Deploy", confirm: true },
    { id: "lock-release", label: "Release Lock", args: ["lock", "release"], group: "Deploy", confirm: true },
    { id: "app-logs", label: "App Logs", args: ["app", "logs", "-f"], group: "App", safe: true },
    { id: "app-details", label: "Details", args: ["app", "details"], group: "App", safe: true },
    { id: "app-start", label: "Start", args: ["app", "start"], group: "App" },
    { id: "app-stop", label: "Stop", args: ["app", "stop"], group: "App" },
    { id: "app-restart", label: "Restart", args: ["app", "restart"], group: "App", confirm: true },
    { id: "exec-bash", label: "Bash Shell", args: ["app", "exec", "--reuse", "-i", "bash"], group: "Console", interactive: true },
    { id: "server-reboot", label: "Server Reboot", args: ["server", "reboot"], group: "Server", confirm: true },
    { id: "server-exec", label: "Server Info", args: ["server", "exec", "hostname && uname -a"], group: "Server", safe: true },
    { id: "audit", label: "Audit", args: ["audit"], group: "Debug", safe: true },
    { id: "version", label: "Version", args: ["version"], group: "Debug", safe: true },
  ];

  function buildAccessoryCommands(names) {
    return names.flatMap(function (name) {
      return [
        { id: "acc-bash-" + name, label: name + ": bash", args: ["accessory", "exec", name, "bash"], group: "Accessories", interactive: true },
        { id: "acc-logs-" + name, label: name + ": logs", args: ["accessory", "logs", name, "-f"], group: "Accessories", safe: true },
      ];
    });
  }

  function groupCommands(commands) {
    var groups = new Map();
    for (var i = 0; i < commands.length; i++) {
      var cmd = commands[i];
      if (!groups.has(cmd.group)) groups.set(cmd.group, []);
      groups.get(cmd.group).push(cmd);
    }
    return groups;
  }

  function CustomStore(storage) {
    this.storage = storage;
  }
  CustomStore.prototype.list = async function () {
    var v = await this.storage.get("customCommands");
    return Array.isArray(v) ? v : [];
  };
  CustomStore.prototype.add = async function (payload) {
    var list = await this.list();
    list.push({ id: crypto.randomUUID(), label: payload.label, args: payload.args, interactive: !!payload.interactive });
    await this.storage.set("customCommands", list);
  };
  CustomStore.prototype.update = async function (id, payload) {
    var list = await this.list();
    var i = list.findIndex(function (c) { return c.id === id; });
    if (i === -1) return;
    list[i] = { id: id, label: payload.label, args: payload.args, interactive: !!payload.interactive };
    await this.storage.set("customCommands", list);
  };
  CustomStore.prototype.remove = async function (id) {
    var list = (await this.list()).filter(function (c) { return c.id !== id; });
    await this.storage.set("customCommands", list);
  };
  CustomStore.prototype.toCommandDefs = function (list) {
    return list.map(function (c) {
      return { id: "custom-" + c.id, label: c.label, args: c.args, group: "Custom", interactive: c.interactive };
    });
  };

  async function exists(runShell, path) {
    var r = await runShell("test -f " + shellQuote(path));
    return r.code === 0;
  }

  async function detectConfigPath(runShell, rootDir, override) {
    if (override && await exists(runShell, override)) return override;
    var candidates = [rootDir + "/config/deploy.yml", rootDir + "/deploy.yml"];
    for (var i = 0; i < candidates.length; i++) {
      if (await exists(runShell, candidates[i])) return candidates[i];
    }
    return null;
  }

  function kamalCommandLine(args) {
    return loginShellCommand(shellJoin(["kamal"].concat(args)));
  }

  function KamalTerminal(opts) {
    this.bridge = opts.bridge;
    this.termId = opts.termId;
    this.term = new opts.Terminal({
      fontFamily: '"JetBrains Mono", Menlo, monospace',
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme: { background: "#0d0d0f", foreground: "#d4d4d4" },
    });
    this.fit = new opts.FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(opts.hostEl);
    this._unsubs = [];
    this._opened = false;
  }
  KamalTerminal.prototype.open = async function (cwd) {
    this.fit.fit();
    var d = this.fit.proposeDimensions() || { rows: 24, cols: 80 };
    var dec = new TextDecoder();
    var self = this;
    this._unsubs.push(this.bridge.terminal.onData(this.termId, function (bytes) { self.term.write(dec.decode(bytes)); }));
    this._unsubs.push(this.bridge.terminal.onExit(this.termId, function () { self.term.writeln("\r\n\x1b[90m-- exited --\x1b[0m"); }));
    this.term.onData(function (data) {
      self.bridge.terminal.write(self.termId, new TextEncoder().encode(data));
    });
    await this.bridge.terminal.open(this.termId, { cwd: cwd, rows: d.rows, cols: d.cols });
    this._opened = true;
  };
  KamalTerminal.prototype.run = function (args) {
    this.bridge.terminal.write(this.termId, new TextEncoder().encode(kamalCommandLine(args) + "\r"));
  };
  KamalTerminal.prototype.runRaw = function (line) {
    this.bridge.terminal.write(this.termId, new TextEncoder().encode(loginShellCommand(line) + "\r"));
  };
  KamalTerminal.prototype.cancel = function () {
    this.bridge.terminal.write(this.termId, new Uint8Array([0x03]));
  };
  KamalTerminal.prototype.resize = function () {
    if (!this._opened) return;
    this.fit.fit();
    var d = this.fit.proposeDimensions();
    if (d && d.rows > 0 && d.cols > 0) this.bridge.terminal.resize(this.termId, d.rows, d.cols);
  };
  KamalTerminal.prototype.dispose = function () {
    this._unsubs.forEach(function (u) { u(); });
    this._unsubs = [];
    try { this.bridge.terminal.close(this.termId); } catch (_) {}
    this.term.dispose();
  };

  var bridge = window.portaBridge;
  var $ = function (id) { return document.getElementById(id); };

  if (!bridge) {
    document.body.textContent = "Missing portaBridge. Reload the extension.";
    throw new Error("kamal: no portaBridge");
  }

  var sidebarEl = $("sidebar");
  var statusEl = $("status-bar");
  var termHostEl = $("term-host");
  var rootDir = bridge.app.rootDir;
  var custom = new CustomStore(bridge.storage);
  var runShell = function (cmd) { return bridge.shell.run(loginShellCommand(cmd)); };
  var SEARCH_THRESHOLD = 12;
  var INSTALL_CMD = 'if [ -w "$(gem env gemdir 2>/dev/null)" ]; then gem install kamal; else gem install kamal --user-install; fi';

  var state = {
    installed: false,
    version: null,
    configPath: null,
    workDir: rootDir,
    accessories: [],
    commands: [],
    search: "",
    selectedId: null,
    editingCustomId: null,
  };
  var term = null;
  var termCounter = 0;
  var _editDraft = null;

  bridge.ui.setTitle("Kamal - " + bridge.app.name);

  async function checkKamal() {
    var found = await runShell("command -v kamal");
    var path = (found.stdout || "").trim().split("\n").pop() || "";
    state.installed = found.code === 0 && !!path;
    if (!state.installed) {
      state.version = null;
      return;
    }
    var version = await runShell("kamal version 2>/dev/null || kamal --version 2>/dev/null || true");
    var label = ((version.stdout || version.stderr || "").trim().split("\n").pop() || path).trim();
    state.version = label.replace(/^kamal\s+/i, "");
  }

  async function loadConfig() {
    var override = await bridge.storage.get("configPathOverride");
    var ovr = typeof override === "string" && override ? override : null;
    state.configPath = await detectConfigPath(runShell, rootDir, ovr);
    if (state.configPath) {
      state.workDir = kamalWorkDir(state.configPath);
      var cat = await runShell("cat " + shellQuote(state.configPath));
      state.accessories = cat.code === 0 ? parseAccessories(cat.stdout) : [];
    } else {
      state.workDir = rootDir;
      state.accessories = [];
    }
  }

  async function rebuildCommands() {
    var customDefs = custom.toCommandDefs(await custom.list());
    state.commands = FIXED_COMMANDS.concat(buildAccessoryCommands(state.accessories), customDefs);
  }

  function freshTerminal() {
    if (!window.Terminal) throw new Error("xterm.js did not load");
    if (!window.FitAddon || !window.FitAddon.FitAddon) throw new Error("xterm fit addon did not load");
    if (term) {
      term.dispose();
      term = null;
    }
    termHostEl.innerHTML = "";
    var termId = "kamal-" + (++termCounter);
    term = new KamalTerminal({
      Terminal: window.Terminal,
      FitAddon: window.FitAddon.FitAddon,
      bridge: bridge,
      hostEl: termHostEl,
      termId: termId,
    });
    return term;
  }

  async function runCommand(cmd) {
    if (cmd.confirm && !confirm("Run: kamal " + cmd.args.join(" ") + " ?")) return;
    state.selectedId = cmd.id;
    var t;
    try {
      t = freshTerminal();
      await t.open(state.workDir);
    } catch (err) {
      bridge.ui.toast("Could not open terminal: " + (err && err.message ? err.message : String(err)), "error");
      return;
    }
    t.run(cmd.args);
    renderStatus();
    renderSidebar();
  }

  async function installKamal(installCmd) {
    var t;
    try {
      t = freshTerminal();
      await t.open(state.workDir);
    } catch (err) {
      bridge.ui.toast("Could not open terminal: " + (err && err.message ? err.message : String(err)), "error");
      return;
    }
    t.runRaw(installCmd);
    renderStatus();
  }

  function el(tag, props, children) {
    props = props || {};
    children = children || [];
    var node = document.createElement(tag);
    Object.assign(node, props);
    [].concat(children).forEach(function (c) { node.append(c); });
    return node;
  }

  function renderStatus() {
    statusEl.innerHTML = "";
    var left = el("div", { className: "status-left" });
    if (state.installed) {
      left.append(el("span", { className: "kamal-version", textContent: "kamal " + (state.version || "") }));
    } else {
      left.append(el("span", { className: "kamal-missing", textContent: "kamal not found" }));
      var btn = el("button", { className: "btn", textContent: "Install Kamal" });
      btn.onclick = function () { installKamal(INSTALL_CMD); };
      left.append(btn);
      var recheck = el("button", { className: "btn", textContent: "Re-check" });
      recheck.onclick = async function () {
        await checkKamal();
        renderStatus();
      };
      left.append(recheck);
    }
    var right = el("div", { className: "status-right" });
    var cancel = el("button", { className: "btn", textContent: "Cancel (Ctrl-C)" });
    cancel.onclick = function () { if (term) term.cancel(); };
    right.append(cancel);
    statusEl.append(left, right);
  }

  function commandMatches(cmd) {
    if (!state.search) return true;
    return cmd.label.toLowerCase().includes(state.search.toLowerCase());
  }

  function renderSidebar() {
    if (!state.configPath) {
      sidebarEl.innerHTML = "";
      sidebarEl.append(el("div", { className: "notice", textContent: "No deploy.yml found under " + rootDir }));
      var input = el("input", { className: "cfg-input", placeholder: "/path/to/deploy.yml" });
      var save = el("button", { className: "btn", textContent: "Set config path" });
      save.onclick = async function () {
        var v = input.value.trim();
        if (!v) return;
        await bridge.storage.set("configPathOverride", v);
        await reload();
      };
      sidebarEl.append(input, save);
      return;
    }

    var listEl = document.getElementById("sidebar-list");
    if (!listEl) {
      sidebarEl.innerHTML = "";
      if (state.commands.length >= SEARCH_THRESHOLD) {
        var search = el("input", {
          id: "sidebar-search",
          className: "search",
          placeholder: "Filter commands...",
          value: state.search,
        });
        search.oninput = function (e) {
          state.search = e.target.value;
          renderCommandList();
        };
        sidebarEl.append(search);
      }
      listEl = el("div", { id: "sidebar-list" });
      sidebarEl.append(listEl);
    }
    renderCommandList();
  }

  function renderCommandList() {
    var listEl = document.getElementById("sidebar-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    var groups = groupCommands(state.commands.filter(commandMatches));
    groups.forEach(function (cmds, group) {
      listEl.append(el("div", { className: "group-header", textContent: group }));
      cmds.forEach(function (cmd) {
        var row = el("div", { className: "cmd-row" + (cmd.id === state.selectedId ? " selected" : "") });
        row.append(el("span", { className: "cmd-label", textContent: cmd.label }));
        row.onclick = function () { runCommand(cmd); };
        if (cmd.group === "Custom") {
          var id = cmd.id.replace(/^custom-/, "");
          var edit = el("button", { className: "icon-btn", textContent: "✎", title: "Edit" });
          edit.onclick = function (e) {
            e.stopPropagation();
            openCustomForm(id);
          };
          var del = el("button", { className: "icon-btn", textContent: "✕", title: "Delete" });
          del.onclick = async function (e) {
            e.stopPropagation();
            await custom.remove(id);
            await rebuildCommands();
            renderSidebar();
          };
          row.append(edit, del);
        }
        listEl.append(row);
      });
    });

    var addCustom = el("button", { className: "btn add-custom", textContent: "＋ Custom command" });
    addCustom.onclick = function () { openCustomForm(""); };
    listEl.append(addCustom);

    if (state.editingCustomId !== null) listEl.append(renderCustomForm());
  }

  async function openCustomForm(id) {
    state.editingCustomId = id;
    if (id) {
      var list = await custom.list();
      var found = list.find(function (c) { return c.id === id; });
      _editDraft = found ? { label: found.label, args: found.args.join(" "), interactive: found.interactive } : { label: "", args: "", interactive: false };
    } else {
      _editDraft = { label: "", args: "", interactive: false };
    }
    renderSidebar();
  }

  function renderCustomForm() {
    var form = el("div", { className: "custom-form" });
    var label = el("input", { className: "cf-label", placeholder: "Label", value: _editDraft.label });
    var args = el("input", { className: "cf-args", placeholder: "args e.g. console", value: _editDraft.args });
    var save = el("button", { className: "btn", textContent: "Save" });
    save.onclick = async function () {
      var payload = {
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
    var cancel = el("button", { className: "btn", textContent: "Cancel" });
    cancel.onclick = function () {
      state.editingCustomId = null;
      renderSidebar();
    };
    form.append(label, args, save, cancel);
    return form;
  }

  async function reload() {
    await loadConfig();
    await rebuildCommands();
    renderStatus();
    sidebarEl.innerHTML = "";
    renderSidebar();
  }

  async function main() {
    try {
      renderStatus();
      sidebarEl.append(el("div", { className: "loading", textContent: "Loading..." }));
      await checkKamal();
      await reload();

      var ro = new ResizeObserver(function () {
        if (term) term.resize();
      });
      ro.observe(termHostEl);
    } catch (err) {
      sidebarEl.innerHTML = "";
      sidebarEl.append(el("div", { className: "notice", textContent: "Load failed: " + (err && err.message ? err.message : String(err)) }));
    }
  }

  main();
})();

import { test } from "node:test";
import assert from "node:assert/strict";
import { shellQuote, shellJoin } from "../lib/shell.js";
import { kamalCommandLine } from "../lib/term.js";

test("shellQuote leaves simple arguments readable", () => {
  assert.equal(shellQuote("/srv/app/config/deploy.yml"), "/srv/app/config/deploy.yml");
});

test("shellQuote protects spaces and apostrophes", () => {
  assert.equal(shellQuote("/srv/bob's app/deploy.yml"), "'/srv/bob'\"'\"'s app/deploy.yml'");
});

test("shellJoin preserves shell operators inside one argument", () => {
  assert.equal(shellJoin(["kamal", "server", "exec", "hostname && uname -a"]), "kamal server exec 'hostname && uname -a'");
});

test("kamalCommandLine quotes command arguments before typing into the PTY", () => {
  assert.equal(kamalCommandLine(["server", "exec", "hostname && uname -a"]), "kamal server exec 'hostname && uname -a'");
});

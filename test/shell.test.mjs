import { test } from "node:test";
import assert from "node:assert/strict";
import { loginShellCommand, shellQuote, shellJoin } from "../lib/shell.js";

test("shellQuote leaves simple arguments readable", () => {
  assert.equal(shellQuote("/srv/app/config/deploy.yml"), "/srv/app/config/deploy.yml");
});

test("shellQuote protects spaces and apostrophes", () => {
  assert.equal(shellQuote("/srv/bob's app/deploy.yml"), "'/srv/bob'\"'\"'s app/deploy.yml'");
});

test("shellJoin preserves shell operators inside one argument", () => {
  assert.equal(shellJoin(["kamal", "server", "exec", "hostname && uname -a"]), "kamal server exec 'hostname && uname -a'");
});

test("loginShellCommand loads user shell startup files for PATH-sensitive commands", () => {
  assert.equal(loginShellCommand("kamal version"), "/bin/zsh -lic 'kamal version'");
});

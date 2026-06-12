import { test } from "node:test";
import assert from "node:assert/strict";
import { commandWithArgs, loginShellCommand, parseAliasCommand, shellQuote, shellJoin, stripDockerTty } from "../lib/shell.js";

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

test("parseAliasCommand extracts zsh alias values", () => {
  const output = "kamal='docker run -it --rm -v \"${PWD}:/workdir\" ghcr.io/basecamp/kamal:latest'\n";
  assert.equal(parseAliasCommand(output, "kamal"), 'docker run -it --rm -v "${PWD}:/workdir" ghcr.io/basecamp/kamal:latest');
});

test("stripDockerTty removes tty flags but keeps stdin flag", () => {
  assert.equal(stripDockerTty("docker run -it --rm image"), "docker run -i --rm image");
  assert.equal(stripDockerTty("docker run -ti --rm image"), "docker run -i --rm image");
  assert.equal(stripDockerTty("docker run -i -t --rm image"), "docker run -i --rm image");
});

test("commandWithArgs appends quoted args to a command template", () => {
  assert.equal(commandWithArgs("docker run -i image", ["server", "exec", "hostname && uname -a"]), "docker run -i image server exec 'hostname && uname -a'");
});

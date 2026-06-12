import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXED_COMMANDS, buildAccessoryCommands, groupCommands } from "../lib/commands.js";

test("FIXED_COMMANDS includes deploy and app logs as non-interactive commands", () => {
  const deploy = FIXED_COMMANDS.find((c) => c.id === "deploy");
  assert.equal(deploy.confirm, true);
  assert.deepEqual(deploy.args, ["deploy"]);
  const logs = FIXED_COMMANDS.find((c) => c.id === "app-logs");
  assert.deepEqual(logs.args, ["app", "logs"]);
});
test("buildAccessoryCommands derives logs per accessory", () => {
  const cmds = buildAccessoryCommands(["db"]);
  assert.deepEqual(cmds.map((c) => c.id), ["acc-logs-db"]);
  assert.deepEqual(cmds[0].args, ["accessory", "logs", "db"]);
});
test("groupCommands buckets by group preserving order", () => {
  const groups = groupCommands(FIXED_COMMANDS);
  assert.ok(groups.has("Deploy"));
  assert.ok(groups.get("Deploy").some((c) => c.id === "deploy"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function localScriptSources(html) {
  const scriptRe = /<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi;
  return [...html.matchAll(scriptRe)]
    .map((m) => m[2])
    .filter((src) => !/^(https?:|data:|file:|\/\/)/i.test(src));
}

test("runtime scripts remain valid when Porta inlines them as classic scripts", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const scripts = localScriptSources(html);
  assert.deepEqual(scripts, ["vendor/xterm.js", "vendor/addon-fit.js", "app.bundle.js"]);

  for (const src of scripts) {
    const js = fs.readFileSync(src, "utf8");
    assert.doesNotThrow(() => new vm.Script(js, { filename: src }), src);
  }
});

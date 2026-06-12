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

test("xterm bootstrap is safe to inline through srcdoc", () => {
  const js = fs.readFileSync("vendor/xterm.js", "utf8");
  assert.equal(js.includes("<"), false);
  assert.equal(js.includes(">"), false);
  assert.equal(/<\/script/i.test(js), false);

  let inserted = null;
  const scriptNode = {
    setAttribute() {},
    text: "",
  };
  const document = {
    currentScript: {
      parentNode: {
        insertBefore(node) {
          inserted = node.text;
        },
      },
      nextSibling: null,
    },
    createElement(tag) {
      assert.equal(tag, "script");
      return scriptNode;
    },
    head: {
      appendChild(node) {
        inserted = node.text;
      },
    },
  };

  vm.runInNewContext(js, {
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    document,
    TextDecoder,
    Uint8Array,
  }, { filename: "vendor/xterm.js" });

  assert.ok(inserted);
  assert.doesNotThrow(() => new vm.Script(inserted, { filename: "vendor/xterm.raw.js" }));
});

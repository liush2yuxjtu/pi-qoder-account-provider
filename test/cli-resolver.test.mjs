import assert from "node:assert/strict";
import { resolve, normalize } from "node:path";
import { resolveQoderCliPath, getQoderCliExecCommand } from "../extensions/cli-resolver.ts";

const norm = (p) => p ? normalize(p).replace(/\\/g, "/") : p;

// 1. Explicit QODERCLI_PATH takes priority
{
  const customPath = resolve("D:/custom/bin/qodercli.exe");
  const result = resolveQoderCliPath({
    env: { QODERCLI_PATH: customPath },
    platform: "win32",
    fileExists: (p) => norm(p) === norm(customPath),
  });
  assert.equal(norm(result), norm(customPath));
}

// 2. Windows: QODERCLI_PATH pointing to .cmd resolves to inner .js if available
{
  const cmdPath = resolve("C:/npm/qodercli.cmd");
  const jsPath = resolve("C:/npm/node_modules/@qoder-ai/qodercli/bundle/qodercli.js");
  const result = resolveQoderCliPath({
    env: { QODERCLI_PATH: cmdPath },
    platform: "win32",
    fileExists: (p) => norm(p) === norm(cmdPath) || norm(p) === norm(jsPath),
  });
  assert.equal(norm(result), norm(jsPath));
}

// 3. Windows: PATH with qodercli.exe returns .exe
{
  const exePath = resolve("C:/tools/qodercli.exe");
  const result = resolveQoderCliPath({
    env: { PATH: "C:/other;C:/tools" },
    platform: "win32",
    fileExists: (p) => norm(p) === norm(exePath),
  });
  assert.equal(norm(result), norm(exePath));
}

// 4. Windows: PATH with qodercli.cmd resolves to node_modules bundle .js
{
  const cmdPath = resolve("C:/Users/test/AppData/Roaming/npm/qodercli.cmd");
  const jsPath = resolve("C:/Users/test/AppData/Roaming/npm/node_modules/@qoder-ai/qodercli/bundle/qodercli.js");
  const result = resolveQoderCliPath({
    env: { PATH: "C:/Users/test/AppData/Roaming/npm" },
    platform: "win32",
    fileExists: (p) => norm(p) === norm(cmdPath) || norm(p) === norm(jsPath),
  });
  assert.equal(norm(result), norm(jsPath));
}

// 5. Windows: Fallback to APPDATA global install if PATH does not match
{
  const jsPath = resolve("C:/Users/test/AppData/Roaming/npm/node_modules/@qoder-ai/qodercli/bundle/qodercli.js");
  const result = resolveQoderCliPath({
    env: { PATH: "C:/Windows", APPDATA: resolve("C:/Users/test/AppData/Roaming") },
    platform: "win32",
    fileExists: (p) => norm(p) === norm(jsPath),
  });
  assert.equal(norm(result), norm(jsPath));
}

// 6. Unix: PATH lookup for qodercli
{
  const binPath = "/usr/local/bin/qodercli";
  const result = resolveQoderCliPath({
    env: { PATH: "/usr/bin:/usr/local/bin" },
    platform: "linux",
    fileExists: (p) => norm(p) === norm(binPath),
  });
  assert.equal(norm(result), norm(binPath));
}

// 7. Not found returns undefined
{
  const result = resolveQoderCliPath({
    env: { PATH: "C:/empty" },
    platform: "win32",
    fileExists: () => false,
  });
  assert.equal(result, undefined);
}

// 8. getQoderCliExecCommand wraps .js with node
{
  const jsPath = resolve("C:/npm/node_modules/@qoder-ai/qodercli/bundle/qodercli.js");
  const cmd = getQoderCliExecCommand(jsPath);
  assert.equal(cmd.command, process.execPath);
  assert.deepEqual(cmd.extraArgs, [jsPath]);

  const exePath = resolve("C:/bin/qodercli.exe");
  const exeCmd = getQoderCliExecCommand(exePath);
  assert.equal(exeCmd.command, exePath);
  assert.deepEqual(exeCmd.extraArgs, []);

  const fallbackCmd = getQoderCliExecCommand(undefined, {
    env: {},
    platform: "win32",
    fileExists: () => false,
  });
  assert.equal(fallbackCmd.command, "qodercli");
  assert.deepEqual(fallbackCmd.extraArgs, []);
}

// 9. Real environment test (if qodercli installed, ensure it resolves)
{
  const realResolved = resolveQoderCliPath();
  console.log("Real environment resolved qodercli path:", realResolved);
  if (process.platform === "win32") {
    // In this Windows environment, @qoder-ai/qodercli is installed globally
    assert.ok(realResolved && realResolved.endsWith("qodercli.js"));
  }
}

console.log("cli-resolver tests: PASS");

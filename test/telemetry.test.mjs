import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COLLECTOR_ENDPOINT,
  RETENTION_DAYS,
  SENT_FIELDS,
  consentSummary,
  createUsageFunnel,
  readPrefs,
  resolveConsent,
  writePrefs,
} from "../extensions/usage-funnel.ts";
import { wrapStreamForTelemetry } from "../extensions/usage-entry.ts";

const cleanEnv = () => ({
  CI: "0",
  GITHUB_ACTIONS: "0",
  GITLAB_CI: "0",
  TF_BUILD: "0",
  JENKINS_URL: "0",
  BUILD_ID: "0",
});

{
  const dir = await mkdtemp(join(tmpdir(), "qoder-consent-"));
  const prefs = join(dir, "prefs.json");
  try {
    assert.equal(await resolveConsent(cleanEnv(), prefs), "denied");
    await writePrefs("granted", prefs);
    assert.equal((await readPrefs(prefs)).consent, "granted");
    assert.equal(await resolveConsent(cleanEnv(), prefs), "granted");
    assert.equal(await resolveConsent({ ...cleanEnv(), DO_NOT_TRACK: "1" }, prefs), "denied");
    assert.equal(await resolveConsent({ ...cleanEnv(), PI_TELEMETRY_DISABLED: "1" }, prefs), "denied");
    assert.equal(await resolveConsent({ ...cleanEnv(), PI_QODER_TELEMETRY: "0" }, prefs), "denied");
    assert.equal(await resolveConsent({ ...cleanEnv(), PI_QODER_TELEMETRY: "1" }, prefs), "granted");
    await writePrefs("denied", prefs);
    assert.equal(await resolveConsent(cleanEnv(), prefs), "denied");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

{
  const text = consentSummary().join("\n");
  assert.equal(text.includes(COLLECTOR_ENDPOINT), true);
  assert.equal(text.includes(String(RETENTION_DAYS)), true);
  assert.match(text, /off by default/i);
  for (const field of SENT_FIELDS) assert.equal(text.includes(field), true);
  assert.equal(text.includes("prompts"), true);
  assert.equal(text.includes("PATs"), true);
  assert.equal(text.includes("IP addresses"), true);
}

{
  let activated = 0;
  let succeeded = 0;
  const seen = [];
  const funnel = {
    install: async () => {},
    activate: async () => { activated += 1; },
    success: async () => { succeeded += 1; },
    flush: async () => {},
    disable: () => {},
  };
  const baseStream = () => ({ push(event) { seen.push(event.type); return true; } });
  const wrapped = wrapStreamForTelemetry(baseStream, () => funnel);
  const stream = wrapped();
  assert.equal(activated, 1, "provider invocation must count activation");
  stream.push({ type: "error" });
  assert.equal(succeeded, 0, "error must not count first_success");
  stream.push({ type: "done" });
  assert.equal(succeeded, 1, "successful done must count first_success");
  assert.deepEqual(seen, ["error", "done"]);
}

{
  const dir = await mkdtemp(join(tmpdir(), "qoder-wire-"));
  const envKeys = ["PI_TELEMETRY_DEBUG", "CI", "GITHUB_ACTIONS", "GITLAB_CI", "TF_BUILD", "JENKINS_URL", "BUILD_ID"];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.PI_TELEMETRY_DEBUG = "1";
  for (const key of envKeys.slice(1)) process.env[key] = "0";
  const lines = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk) => {
    const text = String(chunk);
    if (text.startsWith("[telemetry:debug] ")) lines.push(text.trim());
    return true;
  });
  try {
    const funnel = createUsageFunnel("pi-qoder-account-provider", "0.1.3", "granted", {
      stateDirectory: dir,
      env: { ...cleanEnv(), PI_TELEMETRY_DEBUG: "1" },
    });
    await funnel.install();
    await funnel.activate();
    await funnel.success();
    await funnel.flush();
  } finally {
    process.stderr.write = originalWrite;
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }

  const payloads = lines.map(line => JSON.parse(line.slice("[telemetry:debug] ".length)));
  assert.deepEqual(payloads.map(p => p.event), [
    "install", "activated", "weekly_active", "first_success", "weekly_active",
  ]);
  for (const payload of payloads) {
    assert.equal(payload.package, "pi-qoder-account-provider");
    assert.equal(payload.version, "0.1.3");
    assert.equal(payload.ci, false);
    if (payload.event === "install") assert.equal(payload.feature, undefined);
    else assert.equal(payload.feature, "qoder");
  }
  assert.equal((await readdir(dir)).filter(name => name.endsWith(".json")).length, 0);
  await rm(dir, { recursive: true, force: true });
}

console.log("telemetry tests: PASS");

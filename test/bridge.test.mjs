import assert from "node:assert/strict";
import { parseToolCalls, QODER_MODELS, serializeContext } from "../extensions/index.ts";

assert.equal(QODER_MODELS[0].id, "Qwen3.8-Max");
assert.ok(QODER_MODELS.some(({ id }) => id === "Qwen3.8-Flash"));
assert.ok(QODER_MODELS.some(({ id }) => id === "GLM-5.3-Flash"));
assert.equal(QODER_MODELS.length, 17);

assert.deepEqual(
  parseToolCalls('<pi_tool_call>{"name":"read","arguments":{"path":"README.md"}}</pi_tool_call>'),
  [{ name: "read", arguments: { path: "README.md" } }],
);
assert.deepEqual(
  parseToolCalls('<pi_tool_call>{"name":"read","arguments":{"path":"a"}}</pi_tool_call>\n<pi_tool_call>{"name":"bash","arguments":{"command":"pwd"}}</pi_tool_call>'),
  [
    { name: "read", arguments: { path: "a" } },
    { name: "bash", arguments: { command: "pwd" } },
  ],
);
assert.equal(parseToolCalls("normal answer"), null);
assert.equal(parseToolCalls('prose <pi_tool_call>{"name":"read","arguments":{}}</pi_tool_call>'), null);
assert.equal(parseToolCalls('<pi_tool_call>{bad json}</pi_tool_call>'), null);

const serialized = serializeContext({
  messages: [
    { role: "user", content: "hello", timestamp: 1 },
    {
      role: "assistant",
      content: [{ type: "toolCall", id: "1", name: "read", arguments: { path: "a" } }],
      api: "test",
      provider: "test",
      model: "test",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "toolUse",
      timestamp: 2,
    },
    { role: "toolResult", toolCallId: "1", toolName: "read", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 3 },
  ],
});
assert.match(serialized, /"tool_call"/);
assert.match(serialized, /"tool_result"/);

console.log("bridge tests: PASS");

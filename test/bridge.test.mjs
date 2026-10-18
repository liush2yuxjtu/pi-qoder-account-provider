import assert from "node:assert/strict";
import { bridgeSystemPrompt, parseToolCalls, QODER_MODELS, serializeContext } from "../extensions/index.ts";

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

// Regression test: message.content.map is not a function when transcript contains role: "system"
const serializedWithSystem = serializeContext({
  messages: [
    { role: "system", content: "You are a helpful assistant", timestamp: 0 },
    { role: "user", content: "hello", timestamp: 1 },
    { role: "toolResult", toolCallId: "1", toolName: "read", content: "string result", isError: false, timestamp: 2 },
  ],
});
assert.doesNotMatch(serializedWithSystem, /"role":"system"/);
assert.match(serializedWithSystem, /"role":"user"/);
assert.match(serializedWithSystem, /"role":"tool_result"/);
assert.match(serializedWithSystem, /"string result"/);

// Bridge system prompt extraction: top-level context vs normalized transcript system message
const promptFromDirect = bridgeSystemPrompt({
  systemPrompt: "Direct instructions",
  messages: [],
  tools: [{ name: "bash", description: "exec bash", parameters: { type: "object", properties: { command: { type: "string" } } } }],
});
assert.match(promptFromDirect, /Direct instructions/);
assert.match(promptFromDirect, /PI_TOOLS=.*bash/);

const promptFromTranscript = bridgeSystemPrompt({
  messages: [
    {
      role: "system",
      content: "Transcript instructions",
      timestamp: 0,
    },
    { role: "user", content: "hi", timestamp: 1 },
  ],
  tools: [{ name: "grep", description: "grep pattern", parameters: { type: "object" } }],
});
assert.match(promptFromTranscript, /Transcript instructions/);
assert.match(promptFromTranscript, /PI_TOOLS=.*grep/);

// Edge case tests: empty messages, thinking and toolcall conversion
const complexCtx = {
  messages: [
    { role: "system", content: "sys1", timestamp: 0 },
    { role: "user", content: [{ type: "text", text: "user text" }, { type: "image", mimeType: "image/png", data: "" }], timestamp: 1 },
    { role: "assistant", content: [{ type: "thinking", thinking: "pondering" }, { type: "text", text: "hello" }, { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }], timestamp: 2 },
    { role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: "file.txt" }], isError: false, timestamp: 3 },
    { role: "system", content: "sys2", timestamp: 4 },
    { role: "tool_result", toolCallId: "t2", toolName: "calc", content: "simple string result", isError: true, timestamp: 5 },
  ],
};
const parsedHistory = JSON.parse(serializeContext(complexCtx));
assert.equal(parsedHistory.length, 4);
assert.equal(parsedHistory[0].role, "user");
assert.equal(parsedHistory[0].content, "user text\n[image:image/png]");
assert.equal(parsedHistory[1].role, "assistant");
assert.deepEqual(parsedHistory[1].content, [
  { type: "thinking", text: "pondering" },
  { type: "text", text: "hello" },
  { type: "tool_call", id: "t1", name: "bash", arguments: { command: "ls" } },
]);
assert.equal(parsedHistory[2].role, "tool_result");
assert.equal(parsedHistory[2].content, "file.txt");
assert.equal(parsedHistory[3].role, "tool_result");
assert.equal(parsedHistory[3].content, "simple string result");
assert.equal(parsedHistory[3].isError, true);

console.log("bridge tests: PASS");

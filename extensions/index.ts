import {
  accessToken,
  ProcessTransport,
  qodercliAuth,
  query,
  type SDKMessage,
  type SDKResultMessage,
} from "@qoder-ai/qoder-agent-sdk";
import {
  createAssistantMessageEventStream,
  createProvider,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type Tool,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "qoder";
const API_ID = "qoder-agent-sdk" as Api;
const LOCAL_AUTH = "qoder-local-session";
const AUTH_FILE = "~/.qoder/.auth/user";

export const QODER_MODELS = [
  { id: "Qwen3.8-Max", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536, efforts: { low: "low", medium: "medium", xhigh: "xhigh" } },
  { id: "Qwen3.8-Flash", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "Qwen3.7-Max", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "Qwen3.7-Plus", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "Kimi-K3", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536, efforts: { low: "low", high: "high", max: "max" } },
  { id: "Kimi-K2.7-Code", reasoning: true, contextWindow: 262_144, maxTokens: 65_536 },
  { id: "GLM-5.3", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536, efforts: { low: "low", high: "high", max: "max" } },
  { id: "GLM-5.3-Flash", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "DeepSeek-V4-Pro", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536, efforts: { high: "high", max: "max" } },
  { id: "DeepSeek-V4-Flash", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536, efforts: { low: "low", high: "high", max: "max" } },
  { id: "MiniMax-M3", reasoning: false, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "Auto", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "Ultimate", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "Performance", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "Efficient", reasoning: true, contextWindow: 200_000, maxTokens: 65_536 },
  { id: "Lite", reasoning: false, contextWindow: 200_000, maxTokens: 32_768 },
  { id: "Cantus", reasoning: true, contextWindow: 200_000, maxTokens: 65_536 },
] as const;

const models: Model<Api>[] = QODER_MODELS.map((entry) => ({
  id: entry.id,
  name: `${entry.id} (Qoder account)`,
  api: API_ID,
  provider: PROVIDER_ID,
  baseUrl: "qoder-agent-sdk://local",
  reasoning: entry.reasoning,
  thinkingLevelMap: "efforts" in entry ? entry.efforts : undefined,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: entry.contextWindow,
  maxTokens: entry.maxTokens,
}));

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\uD800-\uDFFF]/g, "\uFFFD") : "";
}

function compactSchema(tool: Tool): Record<string, unknown> {
  const schema = tool.parameters as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: schema.type ?? "object",
      properties: schema.properties ?? {},
      required: schema.required ?? [],
    },
  };
}

export function serializeContext(context: Context): string {
  const history = context.messages.map((message) => {
    if (message.role === "user") {
      const content = typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.type === "text" ? part.text : `[image:${part.mimeType}]`).join("\n");
      return { role: "user", content };
    }
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text };
          if (part.type === "thinking") return { type: "thinking", text: part.thinking };
          return { type: "tool_call", id: part.id, name: part.name, arguments: part.arguments };
        }),
      };
    }
    return {
      role: "tool_result",
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: message.isError,
      content: message.content.map((part) => part.type === "text" ? part.text : `[image:${part.mimeType}]`).join("\n"),
    };
  });
  return JSON.stringify(history);
}

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
}

export function parseToolCalls(text: string): ParsedToolCall[] | null {
  const matches = [...text.matchAll(/<pi_tool_call>\s*([\s\S]*?)\s*<\/pi_tool_call>/g)];
  if (matches.length === 0) return null;
  const outside = text.replace(/<pi_tool_call>[\s\S]*?<\/pi_tool_call>/g, "").trim();
  if (outside) return null;

  try {
    return matches.map((match) => {
      const parsed = JSON.parse(match[1]) as ParsedToolCall;
      if (!parsed || typeof parsed.name !== "string" || !parsed.arguments || typeof parsed.arguments !== "object") {
        throw new Error("Invalid tool call envelope");
      }
      return parsed;
    });
  } catch {
    return null;
  }
}

function bridgeSystemPrompt(context: Context): string {
  const tools = (context.tools ?? []).map(compactSchema);
  return `${context.systemPrompt ?? ""}\n\n` +
    `QODER-PI BRIDGE CONTRACT\n` +
    `You are the model backend inside Pi. Qoder runtime tools are disabled. Pi owns all tool execution and approval.\n` +
    `When a tool is needed, output only one or more exact envelopes, with no prose or Markdown:\n` +
    `<pi_tool_call>{"name":"tool_name","arguments":{}}</pi_tool_call>\n` +
    `Use only listed tools. Arguments must satisfy JSON Schema. After Pi returns tool results, continue from transcript.\n` +
    `When no tool is needed, answer normally and never emit the envelope.\n` +
    `PI_TOOLS=${JSON.stringify(tools)}`;
}

function usageFromResult(result: SDKResultMessage | undefined, output: AssistantMessage): void {
  if (!result) return;
  const usage = result.usage;
  output.usage.input = Number(usage.input_tokens ?? 0);
  output.usage.output = Number(usage.output_tokens ?? 0);
  output.usage.cacheRead = Number(usage.cache_read_input_tokens ?? 0);
  output.usage.cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);
  output.usage.totalTokens = output.usage.input + output.usage.output + output.usage.cacheRead + output.usage.cacheWrite;
  output.usage.cost.total = Number(result.total_cost_usd ?? 0);
}

function textFromMessage(message: SDKMessage): string {
  if (message.type !== "assistant") return "";
  return message.message.content
    .filter((block) => block.type === "text")
    .map((block) => clean(block.text))
    .join("");
}

export function streamQoder(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const output: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "pending",
    timestamp: Date.now(),
  };

  void (async () => {
    stream.push({ type: "start", partial: output });
    const controller = new AbortController();
    const abort = () => controller.abort();
    options?.signal?.addEventListener("abort", abort, { once: true });
    let q: ReturnType<typeof query> | undefined;

    try {
      const resolvedKey = options?.apiKey;
      const auth = resolvedKey && resolvedKey !== LOCAL_AUTH ? accessToken(resolvedKey) : qodercliAuth();
      q = query({
        prompt: `PI_CONVERSATION_JSON=${serializeContext(context)}`,
        options: {
          auth,
          transport: ProcessTransport.default,
          cwd: process.cwd(),
          model: model.id,
          systemPrompt: bridgeSystemPrompt(context),
          tools: [],
          disallowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "Agent", "Skill"],
          permissionMode: "dontAsk",
          includePartialMessages: false,
          maxTurns: 1,
          extraArgs: {
            "max-output-tokens": String(options?.maxTokens ?? model.maxTokens),
            ...(options?.reasoning ? { "reasoning-effort": options.reasoning } : {}),
          },
          persistSession: false,
          abortController: controller,
        },
      });

      let text = "";
      let result: SDKResultMessage | undefined;
      for await (const message of q) {
        if (message.type === "assistant") {
          if (message.error) throw new Error(`Qoder model error: ${message.error}`);
          text += textFromMessage(message);
        } else if (message.type === "result") {
          result = message;
          if (message.subtype !== "success") throw new Error(message.errors.join("; ") || message.subtype);
          if (!text) text = clean(message.result);
        }
      }

      usageFromResult(result, output);
      const toolCalls = parseToolCalls(text);
      if (toolCalls) {
        for (const call of toolCalls) {
          const block = {
            type: "toolCall" as const,
            id: call.id ?? `qoder_${crypto.randomUUID()}`,
            name: call.name,
            arguments: call.arguments,
          };
          const contentIndex = output.content.length;
          output.content.push(block);
          stream.push({ type: "toolcall_start", contentIndex, partial: output });
          stream.push({ type: "toolcall_end", contentIndex, toolCall: block, partial: output });
        }
        output.stopReason = "toolUse";
      } else {
        const contentIndex = output.content.length;
        output.content.push({ type: "text", text });
        stream.push({ type: "text_start", contentIndex, partial: output });
        if (text) stream.push({ type: "text_delta", contentIndex, delta: text, partial: output });
        stream.push({ type: "text_end", contentIndex, content: text, partial: output });
        output.stopReason = result?.stop_reason === "max_tokens" ? "length" : "stop";
      }
      stream.push({ type: "done", reason: output.stopReason, message: output });
      stream.end();
    } catch (error) {
      output.stopReason = controller.signal.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    } finally {
      options?.signal?.removeEventListener("abort", abort);
      await q?.close().catch(() => undefined);
    }
  })();

  return stream;
}

export default function qoderProviderExtension(pi: ExtensionAPI): void {
  const provider = createProvider({
    id: PROVIDER_ID,
    name: "Qoder Account",
    auth: {
      apiKey: {
        name: "Qoder account",
        async login(interaction) {
          const method = await interaction.prompt({
            type: "select",
            message: "Qoder authentication",
            options: [
              { id: "local", label: "Reuse qodercli login", description: "Run qodercli login first" },
              { id: "pat", label: "Personal Access Token", description: "Create at qoder.com/account/integrations" },
            ],
          });
          if (method === "local") {
            return { type: "api_key", key: LOCAL_AUTH };
          }
          const key = await interaction.prompt({ type: "secret", message: "Qoder Personal Access Token" });
          return { type: "api_key", key };
        },
        async check({ ctx, credential }) {
          if (credential?.key) return { type: "api_key", source: credential.key === LOCAL_AUTH ? "qodercli login" : "stored PAT" };
          if (await ctx.env("QODER_PERSONAL_ACCESS_TOKEN")) return { type: "api_key", source: "QODER_PERSONAL_ACCESS_TOKEN" };
          if (await ctx.fileExists(AUTH_FILE)) return { type: "api_key", source: "qodercli login" };
          return undefined;
        },
        async resolve({ ctx, credential }) {
          if (credential?.key) return { auth: { apiKey: credential.key }, source: credential.key === LOCAL_AUTH ? "qodercli login" : "stored PAT" };
          const token = await ctx.env("QODER_PERSONAL_ACCESS_TOKEN");
          if (token) return { auth: { apiKey: token }, source: "QODER_PERSONAL_ACCESS_TOKEN" };
          if (await ctx.fileExists(AUTH_FILE)) return { auth: { apiKey: LOCAL_AUTH }, source: "qodercli login" };
          return undefined;
        },
      },
    },
    models,
    api: { stream: streamQoder, streamSimple: streamQoder },
  });

  pi.registerProvider(provider);

  pi.registerCommand("qoder-status", {
    description: "Show Qoder CLI authentication and installed version",
    handler: async (_args, ctx) => {
      const result = await pi.exec("qodercli", ["status"], { timeout: 15_000 });
      ctx.ui.notify((result.stdout || result.stderr || "No output").trim(), result.code === 0 ? "info" : "warning");
    },
  });
}

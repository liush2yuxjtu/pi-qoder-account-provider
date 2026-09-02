# pi-qoder-account-provider

Use Qoder account models in [Pi](https://pi.dev), including `Qwen3.8-Max`, through Qoder's official Agent SDK and CLI login.

This package does not use CPA, reverse-engineered browser sessions, COSY signatures, or WAF bypasses.

## Install

Requirements:

- Node.js 20+
- Pi
- Qoder CLI 1.1.40 or newer
- Qoder account or Personal Access Token

```bash
npm install -g @qoder-ai/qodercli
qodercli login
pi install npm:pi-qoder-account-provider
```

Restart Pi or run `/reload`, then:

```text
/login qoder
```

Choose `Reuse qodercli login`. Alternatively, choose `Personal Access Token` or set `QODER_PERSONAL_ACCESS_TOKEN`.

Select model:

```text
/model
```

Choose `qoder/Qwen3.8-Max`.

## Models

The package registers the current Qoder account catalog observed during release, including:

- `Qwen3.8-Max`, `Qwen3.8-Flash`, `Qwen3.7-Max`, `Qwen3.7-Plus`
- `Kimi-K3`, `Kimi-K2.7-Code`
- `GLM-5.3`, `GLM-5.3-Flash`
- `DeepSeek-V4-Pro`, `DeepSeek-V4-Flash`
- `MiniMax-M3`
- `Auto`, `Ultimate`, `Performance`, `Efficient`, `Lite`, `Cantus`

Qoder updates model availability server-side. Use `qodercli --list-models` as account-specific truth.

## How it works

Qoder publishes an Agent SDK rather than a standard OpenAI-compatible endpoint. This extension adapts each Pi provider request into one ephemeral Qoder SDK query.

Qoder runtime tools are disabled. Pi remains responsible for tool execution and approval. When Qoder needs a tool, the extension asks it to emit a strict `<pi_tool_call>` envelope, converts that envelope into a Pi tool call, then sends the Pi tool result back on the next turn.

## Security

Prompt text, conversation history, tool schemas, and necessary tool results are sent to Qoder's model service. Do not use this provider for data that must not leave your environment.

Qoder built-in file, shell, web, subagent, and skill tools are disabled by this bridge. Qoder queries use `dontAsk`, `maxTurns: 1`, and `persistSession: false`.

PATs are entered through Pi secret input or read from `QODER_PERSONAL_ACCESS_TOKEN`. Never commit tokens.

## Limitations

- Tool calling uses a model-followed envelope, not provider-native structured tool calls.
- One Pi tool loop starts multiple Qoder queries. It can be slower and consume more Credits than one text response.
- Input is currently text-only. Qoder vision models are listed, but Pi image blocks are not bridged yet.
- Qoder Credits do not map cleanly to Pi per-million-token pricing. Static model prices remain zero; SDK request cost is preserved when available.

## Verify

```bash
npm test
npm run typecheck
npm pack --dry-run
```

After login:

```bash
pi --provider qoder --model Qwen3.8-Max --thinking off -p \
  'Reply with exactly: QODER_PI_OK'
```

## Uninstall

```bash
pi remove npm:pi-qoder-account-provider
```

## Sources and terms

- [Qoder Agent SDK documentation](https://docs.qoder.com/cli/sdk/overview)
- [Qoder authentication](https://docs.qoder.com/cli/authentication)
- [Qoder models](https://docs.qoder.com/cli/model)
- [Qoder Product Service Terms](https://qoder.com/product-service)
- [Pi custom provider documentation](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/custom-provider.md)

Extension source is MIT licensed. Qoder CLI and Agent SDK remain governed by Qoder's terms.

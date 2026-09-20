import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import qoderProviderExtension from "./index.js";
import {
  COLLECTOR_ENDPOINT,
  NEVER_SENT,
  RETENTION_DAYS,
  SENT_FIELDS,
  consentSummary,
  createUsageFunnel,
  resolveConsent,
  writePrefs,
  type Consent,
  type UsageFunnel,
} from "./usage-funnel.js";

const PACKAGE = "pi-qoder-account-provider";
const version = String(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);

export default async function usageInstrumentedQoderProvider(pi: ExtensionAPI): Promise<void> {
  let consent: Consent = await resolveConsent();
  let funnel: UsageFunnel | undefined =
    consent === "granted" ? createUsageFunnel(PACKAGE, version, consent) : undefined;

  pi.registerCommand("qoder-telemetry", {
    description: "Usage telemetry: status, on, off (off by default; on requires confirmation)",
    handler: async (args: string, ctx: ExtensionContext) => {
      const action = args.trim().toLowerCase();
      consent = await resolveConsent();

      if (action === "on") {
        if (!ctx.hasUI) throw new Error("Enabling telemetry requires an interactive UI confirmation.");
        const accepted = await ctx.ui.confirm(
          "Enable anonymous Qoder-provider telemetry?",
          [...consentSummary(), "", "Enable telemetry now?"].join("\n"),
        );
        if (!accepted) {
          ctx.ui.notify("Usage telemetry remains disabled.", "info");
          return;
        }
        await writePrefs("granted");
        consent = await resolveConsent();
        if (consent !== "granted") {
          ctx.ui.notify("Usage telemetry remains disabled by an environment privacy override.", "warning");
          return;
        }
        funnel?.disable();
        funnel = createUsageFunnel(PACKAGE, version, consent);
        await funnel.install();
        ctx.ui.notify("Usage telemetry enabled. /qoder-telemetry off disables it immediately.", "info");
        return;
      }

      if (action === "off") {
        await writePrefs("denied");
        consent = "denied";
        funnel?.disable();
        funnel = undefined;
        if (ctx.hasUI) ctx.ui.notify("Usage telemetry disabled.", "info");
        return;
      }

      const effective = consent === "granted" ? "on" : "off (default)";
      const message = [
        `Usage telemetry: ${effective}`,
        `Collector: ${COLLECTOR_ENDPOINT}`,
        `Fields: ${SENT_FIELDS.join(", ")}`,
        `Never sent: ${NEVER_SENT.join(", ")}`,
        `Retention: ${RETENTION_DAYS} days`,
        "Enable with /qoder-telemetry on; disable with /qoder-telemetry off or DO_NOT_TRACK=1.",
        "Inspect exact payloads without sending: PI_TELEMETRY_DEBUG=1.",
      ].join("\n");
      if (ctx.hasUI) ctx.ui.notify(message, "info");
    },
  });

  const wrapStream = (streamFn: any) => {
    if (typeof streamFn !== "function") return streamFn;
    return (...args: any[]) => {
      void funnel?.activate();
      const stream = streamFn(...args);
      if (stream && typeof stream.push === "function") {
        const push = stream.push.bind(stream);
        stream.push = (event: any) => {
          // streamQoder only emits "done" after a successful SDK result.
          // Abort/model failures emit "error", so they do not count first_success.
          if (event?.type === "done") void funnel?.success();
          return push(event);
        };
      }
      return stream;
    };
  };

  const instrumented = new Proxy(pi, {
    get(target, property, receiver) {
      if (property !== "registerProvider") return Reflect.get(target, property, receiver);
      return (provider: any) => {
        const api = provider?.api;
        const wrapped = api ? {
          ...provider,
          api: {
            ...api,
            stream: wrapStream(api.stream),
            streamSimple: wrapStream(api.streamSimple),
          },
        } : provider;
        return target.registerProvider(wrapped);
      };
    },
  }) as ExtensionAPI;

  pi.on("session_start", () => {
    void funnel?.install();
  });

  qoderProviderExtension(instrumented);
}

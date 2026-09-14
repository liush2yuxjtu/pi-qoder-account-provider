import { readFileSync } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import qoderProviderExtension from './index';
import { createUsageFunnel } from './usage-funnel';

const version = String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);

export default function usageInstrumentedQoderProvider(pi: ExtensionAPI): void {
  const funnel = createUsageFunnel('pi-qoder-account-provider', version);
  pi.on('session_start', () => { void funnel.launch(); });

  const wrapStream = (streamFn: any) => {
    if (typeof streamFn !== 'function') return streamFn;
    return (...args: any[]) => {
      const stream = streamFn(...args);
      if (stream && typeof stream.push === 'function') {
        const push = stream.push.bind(stream);
        stream.push = (event: any) => {
          if (event?.type === 'done') void funnel.success();
          return push(event);
        };
      }
      return stream;
    };
  };

  const instrumented = new Proxy(pi, {
    get(target, property, receiver) {
      if (property !== 'registerProvider') return Reflect.get(target, property, receiver);
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

  qoderProviderExtension(instrumented);
}

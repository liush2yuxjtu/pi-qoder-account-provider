import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface ResolveCliOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  fileExists?: (path: string) => boolean;
}

function resolveBundleFromCmd(cmdPath: string, fileExists: (p: string) => boolean): string | undefined {
  const dir = dirname(cmdPath);
  const candidates = [
    join(dir, "node_modules", "@qoder-ai", "qodercli", "bundle", "qodercli.js"),
    join(dir, "..", "node_modules", "@qoder-ai", "qodercli", "bundle", "qodercli.js"),
    join(dir, "..", "@qoder-ai", "qodercli", "bundle", "qodercli.js"),
  ];
  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }
  return undefined;
}

export function resolveQoderCliPath(options?: ResolveCliOptions): string | undefined {
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;
  const fileExists = options?.fileExists ?? existsSync;

  // 1. Explicit QODERCLI_PATH
  if (env.QODERCLI_PATH) {
    if (platform === "win32" && /\.(cmd|bat)$/i.test(env.QODERCLI_PATH)) {
      const bundle = resolveBundleFromCmd(env.QODERCLI_PATH, fileExists);
      if (bundle) return bundle;
    }
    if (fileExists(env.QODERCLI_PATH)) {
      return env.QODERCLI_PATH;
    }
  }

  // 2. Search in PATH
  const pathDelimiter = platform === "win32" ? ";" : ":";
  const pathDirs = (env.PATH ?? "")
    .split(pathDelimiter)
    .map((dir) => dir.trim())
    .filter(Boolean);

  for (const dir of pathDirs) {
    if (platform === "win32") {
      const exePath = join(dir, "qodercli.exe");
      if (fileExists(exePath)) return exePath;

      const cmdPath = join(dir, "qodercli.cmd");
      if (fileExists(cmdPath)) {
        const bundle = resolveBundleFromCmd(cmdPath, fileExists);
        if (bundle) return bundle;
      }

      const npmBundle = join(dir, "node_modules", "@qoder-ai", "qodercli", "bundle", "qodercli.js");
      if (fileExists(npmBundle)) return npmBundle;

      const binParentBundle = join(dir, "..", "@qoder-ai", "qodercli", "bundle", "qodercli.js");
      if (fileExists(binParentBundle)) return binParentBundle;
    } else {
      const binPath = join(dir, "qodercli");
      if (fileExists(binPath)) return binPath;
    }
  }

  // 3. Fallback to common global install locations
  if (platform === "win32") {
    const candidates = [
      env.APPDATA && join(env.APPDATA, "npm", "node_modules", "@qoder-ai", "qodercli", "bundle", "qodercli.js"),
      env.LOCALAPPDATA && join(env.LOCALAPPDATA, "pnpm", "global", "5", "node_modules", "@qoder-ai", "qodercli", "bundle", "qodercli.js"),
      env.PNPM_HOME && join(env.PNPM_HOME, "global", "5", "node_modules", "@qoder-ai", "qodercli", "bundle", "qodercli.js"),
      env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Yarn", "Data", "global", "node_modules", "@qoder-ai", "qodercli", "bundle", "qodercli.js"),
      join(homedir(), ".qoder", "local", "qodercli.exe"),
    ].filter((p): p is string => Boolean(p));

    for (const candidate of candidates) {
      if (fileExists(candidate)) return candidate;
    }
  } else {
    const candidates = [
      join(homedir(), ".qoder", "local", "qodercli"),
      join(homedir(), ".local", "bin", "qodercli"),
    ];
    for (const candidate of candidates) {
      if (fileExists(candidate)) return candidate;
    }
  }

  return undefined;
}

export function getQoderCliExecCommand(
  cliPath?: string,
  options?: ResolveCliOptions,
): { command: string; extraArgs: string[] } {
  const resolved = cliPath ?? resolveQoderCliPath(options);
  if (resolved && /\.(js|mjs|cjs)$/i.test(resolved)) {
    return { command: process.execPath, extraArgs: [resolved] };
  }
  return { command: resolved ?? "qodercli", extraArgs: [] };
}

# Release report

## Published and verified

- GitHub: <https://github.com/liush2yuxjtu/pi-qoder-account-provider>
- npm: <https://www.npmjs.com/package/pi-qoder-account-provider>
- Pi Package Gallery: <https://pi.dev/packages/pi-qoder-account-provider>
- Version: `0.1.0`
- npm maintainer: `nyn5255`
- License: MIT

## Verification

- Public GitHub CI passed.
- npm registry metadata and integrity resolved publicly.
- Clean `pi install npm:pi-qoder-account-provider@0.1.0` succeeded.
- Clean install exposed 17 Qoder models.
- `qoder/Qwen3.8-Max` returned `QODER_NPM_OK` through the installed npm package.
- Pi Gallery rendered package description, README, manifest, npm link, repository link, and install command.
- npm Trusted Publisher is bound to `liush2yuxjtu/pi-qoder-account-provider` and `.github/workflows/publish.yml`.

## Skipped

No extra registries. Homebrew, IDE stores, MCP registries, language registries, and Agent Skill directories are not native fits.

## Install

```bash
npm install -g @qoder-ai/qodercli
qodercli login
pi install npm:pi-qoder-account-provider
```

Then run `/login qoder` and select `qoder/Qwen3.8-Max` through `/model`.

## Current evidence snapshot

Initial snapshot: 0 GitHub stars, 0 forks, one npm version, one Pi Gallery listing. These metrics are reported separately and do not represent unique users.

## Maintenance

Future releases use GitHub Release plus npm Trusted Publisher/OIDC. Each release must rerun tests, typecheck, package dry-run, clean installation, model discovery, and one live Qoder smoke test.

## Resume-safe claim

Published and verified `pi-qoder-account-provider@0.1.0` on GitHub, npm, and Pi Package Gallery, with 17 discovered Qoder models and a successful clean-install `Qwen3.8-Max` smoke test.

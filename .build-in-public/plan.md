# Distribution plan

## Canonical artifact and version

- Artifact: Pi provider extension for Qoder accounts
- Package: `pi-qoder-account-provider@0.1.0`
- Public source: `github.com/liush2yuxjtu/pi-qoder-account-provider`
- License: MIT for extension source; Qoder dependency remains under Qoder Product Service Terms

## Direct channels

- GitHub public repository: source, issues, stars, releases
- npm public package: native Pi package delivery and download metrics
- Pi Package Gallery: automatic discovery through npm keyword `pi-package`

## Wrapper channels

None. Homebrew, IDE stores, MCP registries, and skill catalogs do not fit a Pi provider extension.

## Rejected channels and reasons

- PyPI/crates.io/container registries: no native implementation or runtime value
- skills.sh/ClawHub/LobeHub: package is an executable Pi extension, not an Agent Skill
- CPA: user explicitly excludes CPA and Qoder is not CPA-compatible

## Public metrics per channel

- GitHub: stars, forks, issues, releases
- npm: package downloads and versions
- Pi Gallery: listing and package metadata; npm-backed discovery

## Authentication, review, signing, and fee gates

- GitHub CLI authenticated as `liush2yuxjtu`
- npm maintainer verified as `nyn5255`; security key / Touch ID 2FA enabled
- Initial release used npm Web CLI authentication
- Future releases use GitHub Actions Trusted Publisher/OIDC through public `.github/workflows/publish.yml`
- No known fees or manual marketplace review

## Release waves and rollback

1. Merge source snapshot into private `dot-pi`. Completed.
2. Create public GitHub repository and verify CI. Completed.
3. Publish `0.1.0` with npm Web CLI authentication. Completed.
4. Verify npm clean install and Pi Gallery listing. Completed.
5. Use public GitHub OIDC workflow for future releases. Configured.
6. Roll back by npm deprecation and corrective patch; never unpublish a depended-on release.

## Resume-safe reporting plan

Record repository URL, npm URL/version, tarball integrity, gallery URL/status, publish run URL, clean-install result, and UTC publication time in `release-manifest.json` and `release-report.md`.

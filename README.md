# 🔬 ngpulse

**The Angular project health CLI**

[![npm](https://img.shields.io/npm/v/@ngpulse/cli?color=e63946&style=flat-square)](https://www.npmjs.com/package/@ngpulse/cli)
[![CI](https://img.shields.io/github/actions/workflow/status/apelleti/ngpulse/ci.yml?style=flat-square&label=CI)](https://github.com/apelleti/ngpulse/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-457b9d?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178c6?style=flat-square)](https://www.typescriptlang.org/)

Diagnose your Angular codebase in seconds — zero config, zero friction.

```bash
npx @ngpulse/cli info
```

---

![ngpulse info demo](demo/demo-info.gif)

<details>
<summary>More demos</summary>

**Tech debt overview**
![debt-log](demo/demo-debt-log.gif)

**Route tree**
![route-tree](demo/demo-route-tree.gif)

**Security scan**
![hardcoded-secrets](demo/demo-hardcoded-secrets.gif)

**Migration hints**
![migration-hints](demo/demo-migration-hints.gif)

</details>

---

## Why ngpulse?

Joining a new Angular project means spending hours piecing together the state of the codebase. What version is it on? How much of it is still NgModule-based? Where's the tech debt piling up?

**ngpulse answers all of that in one command.**

> 🚀 **Onboarding** — understand a project in 30 seconds, not 3 hours  
> 🧹 **Refactoring** — find dead CSS, orphan files, and empty boilerplate  
> 🔒 **Security** — detect hardcoded secrets and credentials  
> 📈 **Migration tracking** — monitor standalone and signals adoption over time  
> 🤖 **CI-ready** — pipe `--json` output into `jq` to fail builds on regressions  

---

## Installation

```bash
# Run without installing
npx @ngpulse/cli <command>

# Install globally
npm install -g @ngpulse/cli
pnpm add -g @ngpulse/cli
```

📦 [npmjs.com/package/@ngpulse/cli](https://www.npmjs.com/package/@ngpulse/cli)

---

## Commands

### 📊 Project Overview

| Command | Description |
|---|---|
| `info` | Angular neofetch — versions, artifact counts, health indicators |
| `info --more` | Same + per-file breakdown for each indicator |
| `compat-matrix` | Check Angular / TypeScript / RxJS / Node version compatibility |
| `dep-map` | All dependencies categorized: Angular / ecosystem / generic |
| `env-compare` | Diff `environment*.ts` files — spot missing keys across envs |

### 🔍 Code Quality

| Command | Description |
|---|---|
| `dead-css` | Find unused CSS classes per component |
| `orphans` | Files not referenced by any import |
| `empty-barrel` | Empty stylesheets, trivial specs, skeleton services |
| `circular-deps` | Detect circular imports across the codebase |
| `input-output` | Unused `@Input()` / `@Output()` decorators |
| `naming-check` | Enforce Angular naming conventions (selectors, suffixes, kebab-case) |
| `style-audit` | Find `::ng-deep`, `!important`, and unscoped styles |

### 🧭 Architecture

| Command | Description |
|---|---|
| `route-tree` | Full route tree with guards, lazy markers, and component names |
| `component-catalog` | All components — standalone, selectors, change detection strategy |
| `component-weight` | Rank components by total file size (TS + HTML + SCSS) |

### 🚀 Migration

| Command | Description |
|---|---|
| `migration-hints` | Prioritized list of Angular modernization opportunities |
| `signal-migrate` | Identify `@Input()` and properties ready for `signal()` migration |

### 🛡 Security & Debt

| Command | Description |
|---|---|
| `hardcoded-secrets` | Detect API keys, tokens, and credentials in source files |
| `debt-log` | `TODO` / `FIXME` / `HACK` with git blame — age and author |
| `i18n-check` | Text nodes missing `i18n` markers in templates |
| `test-coverage` | Parse and display your lcov / Istanbul coverage report |

---

## Global Options

```
-r, --root <path>   Angular project root (default: cwd)
    --json           Machine-readable JSON output
-m, --more           Show additional details (file paths, breakdowns)
-v, --verbose        Debug output
-V, --version        Print version
```

---

## Examples

**Quick codebase audit:**
```bash
npx @ngpulse/cli info
npx @ngpulse/cli route-tree
npx @ngpulse/cli debt-log
```

**Security check:**
```bash
npx @ngpulse/cli hardcoded-secrets
```

**Migration planning:**
```bash
npx @ngpulse/cli migration-hints
npx @ngpulse/cli signal-migrate --more
```

**CI pipeline — fail on regressions:**
```bash
# Fail if orphan files are introduced
npx @ngpulse/cli orphans --json | jq 'if length > 0 then halt_error(1) else empty end'

# Fail on incompatible versions
npx @ngpulse/cli compat-matrix --json | jq 'if map(select(.compatible == false)) | length > 0 then halt_error(1) else empty end'

# Export debt report
npx @ngpulse/cli debt-log --json > debt-report.json
```

---

## Contributing

```bash
git clone https://github.com/apelleti/ngpulse.git
cd ngpulse
pnpm install
pnpm build
pnpm test
pnpm test:e2e
```

Each command lives in its own package under `packages/`, with shared utilities in `@ngpulse/shared`. Tests use [Vitest](https://vitest.dev/).

| Script | Description |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm test` | Unit tests (140 tests) |
| `pnpm test:e2e` | E2E tests against real fixtures (31 tests) |
| `pnpm lint` | ESLint |

---

## Packages

All tools are published individually — use only what you need:

| Package | Version |
|---|---|
| [`@ngpulse/cli`](https://www.npmjs.com/package/@ngpulse/cli) | [![npm](https://img.shields.io/npm/v/@ngpulse/cli?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/cli) |
| [`@ngpulse/info`](https://www.npmjs.com/package/@ngpulse/info) | [![npm](https://img.shields.io/npm/v/@ngpulse/info?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/info) |
| [`@ngpulse/dead-css`](https://www.npmjs.com/package/@ngpulse/dead-css) | [![npm](https://img.shields.io/npm/v/@ngpulse/dead-css?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/dead-css) |
| [`@ngpulse/debt-log`](https://www.npmjs.com/package/@ngpulse/debt-log) | [![npm](https://img.shields.io/npm/v/@ngpulse/debt-log?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/debt-log) |
| [`@ngpulse/orphans`](https://www.npmjs.com/package/@ngpulse/orphans) | [![npm](https://img.shields.io/npm/v/@ngpulse/orphans?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/orphans) |
| [`@ngpulse/circular-deps`](https://www.npmjs.com/package/@ngpulse/circular-deps) | [![npm](https://img.shields.io/npm/v/@ngpulse/circular-deps?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/circular-deps) |
| [`@ngpulse/migration-hints`](https://www.npmjs.com/package/@ngpulse/migration-hints) | [![npm](https://img.shields.io/npm/v/@ngpulse/migration-hints?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/migration-hints) |
| [`@ngpulse/hardcoded-secrets`](https://www.npmjs.com/package/@ngpulse/hardcoded-secrets) | [![npm](https://img.shields.io/npm/v/@ngpulse/hardcoded-secrets?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/hardcoded-secrets) |
| [`@ngpulse/signal-migrate`](https://www.npmjs.com/package/@ngpulse/signal-migrate) | [![npm](https://img.shields.io/npm/v/@ngpulse/signal-migrate?style=flat-square&color=e63946)](https://www.npmjs.com/package/@ngpulse/signal-migrate) |

---

<div align="center">
MIT © Antoine Apelleti
</div>

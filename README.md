# Tech Week 2026 · SF & LA Field Guide

English (default) · [简体中文](README.zh-CN.md)

A mobile-first, independent bilingual guide to Tech Week: [English website](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/) · [中文网站](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/zh/).

The live guide covers **2,389 official events across 30 topics**. This source repository builds a clearly labeled **30-event fictional demo**, with 37 pages per language. Topics sort by event count; events sort chronologically. List and calendar views share city, date, search and address-tip filters. Visitors can keep an anonymous Wishlist, use a public nickname, share address tips and rate attended events. Optional Google sign-in restores records across devices.

## Run locally

Use **Node.js 24** and **Python 3.13**:

```sh
cd website
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
npm ci
npm run verify
npm run preview:wishlist
```

Open `http://127.0.0.1:4173/`. The default configuration uses a local SQLite database and requires no Cloudflare credentials. On Windows, activate `.venv\Scripts\Activate.ps1` in PowerShell. `npm run preview` serves only static pages; use `preview:wishlist` to test interactions.

Default builds use the fictional examples in `examples/demo/`. Live content is kept separately; set `TECH_WEEK_CONTENT_DIR` to an authorized content checkout for a production build (see [the content format](docs/content.md)). Browsing and language switching do not call an AI model or a translation service. Homepage contribution totals refresh from the API without rebuilding the site.

## Project structure

| Location                 | Responsibility                                                       |
| ------------------------ | -------------------------------------------------------------------- |
| `website/templates/`     | Autoescaped page templates                                           |
| `website/public/assets/` | Shared browser behavior and responsive styles                        |
| `website/backend/`       | Workers API, authentication, validation and D1 schema                |
| `website/scripts/`       | Build, localization, source validation and deployment configuration  |
| `website/src/`           | Topic definitions, interface labels and translations                 |
| `website/tests/`         | Local API, authentication, localization and rendering regressions    |
| `examples/demo/`         | Fictional events, reviewed demo membership and example content files |

## Quality checks

`npm run verify` checks formatting with Prettier/Ruff, JavaScript and Python lint, byte-for-byte reproducibility across clean builds, calendar coverage, bilingual data parity, and the automated test suites. `npm run format` applies the shared style. Builds render to a temporary directory before replacing `dist/`, so a rendering failure preserves the previous website artifact.

GitHub Actions also scans Git history for credentials with a pinned Gitleaks binary and verified checksum. Pull requests run checks only. Enabled pushes to `main` deploy the API, then the website, followed by read-only live verification. Deployments require explicit configuration and never run database migrations or write test contributions to production.

## Languages

English uses `/`; Chinese uses `/zh/` with matching paths. The language switch keeps the current page, search, filters and sharing or recovery fragment. Both languages share the same Wishlist and login identity. Event names, host names and visitor contributions retain their original wording.

Translations are compiled from `website/src/locales/en.json`. Browser copy is translated through JavaScript syntax nodes, preserving code, escaping and template expressions. Missing translations fail the build. See [website details](website/README.md).

## Contribute and deploy

Start with [contributing](CONTRIBUTING.md), [architecture](docs/architecture.md) and [deployment](docs/deployment.md). Report vulnerabilities using the [security policy](SECURITY.md).

Original code and documentation use the [MIT License](LICENSE). **Third-party calendar descriptions, images, trademarks and source material are not relicensed under MIT.** Review [NOTICE.md](NOTICE.md) for the source/data boundary.

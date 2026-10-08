# Tech Week 2026 · Bilingual website

English (default) · [简体中文](README.zh-CN.md)

[English site](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/) · [中文网站](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/zh/) · [Deployment setup](../README.md)

## Demo and live content

A fresh checkout builds 30 fictional demonstration events, one per topic. A visible notice identifies demo pages. The live website uses a separate private content checkout for SF and LA events; current counts and the checked timestamp come from that content snapshot. Real snapshots, full organizer descriptions and visitor records are not distributed here. See [content format](../docs/content.md).

Both languages share event IDs, taxonomy, dates and counts. Topics sort by event count; events sort chronologically. List and calendar views work on event, topic and Wishlist pages. Calendar date buttons show counts after the other filters are applied; multiday events appear on each covered day, using the published Pacific calendar dates.

The address-tip filter calls `/v1/community/address-events`, which returns event IDs and current retained tip counts only. It refreshes every 30 seconds while enabled and visible, and immediately after the visitor changes an address tip. Failed requests show a retry state; previous results remain labeled as stale. Filter and view selections survive language switching and URL sharing.

## Build, preview and checks

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
npm ci
npm run verify
npm run preview:wishlist
```

Use Node.js 24 and Python 3.13. The full preview serves port 4173 using `.local/wishlist.sqlite`, separate from production. `npm run preview` serves static files only.

`scripts/build.py` renders the Jinja templates in `templates/`, generates the API event allowlist and calls `scripts/localize.py`. Builds run in a temporary output directory before replacing `dist/`. Formatting, lint and byte-for-byte reproducibility checks run before the source and behavior tests. Output is 37 English and 37 Chinese HTML pages. `scripts/check.py` checks source coverage, taxonomy evidence and exclusions, counts, chronology, internal links and cross-language data parity. `npm test` covers anonymous identities, public nicknames, contribution rules, Google token verification and account merging. `scripts/check_deploy.py` performs only read-only live checks after deployment.

## Localization

English is the default at `/`; Chinese is under `/zh/`. Both have matching home, event, topic, Wishlist, guide, update, privacy and 404 pages. Canonical and alternate-language links are generated at build time. English and Chinese CSV exports are separate.

`src/locales/en.json` is the translation catalog. The build fails on untranslated interface, topic, editorial-note or change-log copy. Source browser scripts share interaction logic; an Acorn parser translates string literals and template text to generate English bundles under `dist/assets/en/`, preserving identifiers and comments. `public/assets/locale.js` handles language links, filter-value conversion and translated API errors. No visitor request calls an AI model or translation service.

Reviewed-event briefs are translated from the same editorial summaries, preserving their meaning in both languages. Shared summaries have one shared translation. Other briefs use official theme and format labels. Original event titles, host names, visitor nicknames, address tips and notes remain unchanged. Search supports translated and source-language text.

The switch preserves the current route, city, date, format, status, sort, search and URL fragment. Recovery fragments remain available for switching languages while the restore panel is open. Both languages use the same localStorage identity and backend records, so switching cannot create a separate account or Wishlist.

## Data and topics

- `<content>/website/src/snapshot.json` references the current full-description snapshot.
- `<content>/website/src/topic_membership.json` is the reviewed membership list with supporting evidence. Broad official tags never automatically add an event.
- `src/topics.json` defines topics. `<content>/website/src/briefs.json` and notes in `src/calendar-labels.json` provide Chinese editorial summaries.
- `<content>/website/src/refresh.json` stores changes; `scripts/updates.py` renders the change log.
- `<content>/website/src/luma_links.json` stores paired sources. `<content>/website/src/system_one_review.json` retains decision model evidence and leads.
- `public/assets/` contains shared styles and browser logic. Raw research files and full-source datasets are not published as static downloads.

Events are deduplicated by official ID. Topic counts overlap and cannot be summed. Unmatched Luma leads are excluded from official counts. Removal from the calendar does not imply cancellation. Calendar dates and registration statuses are snapshots, not live availability.

AI Companions uses Character.ai, Zeta and Tipsy as category examples; Personal AI Agents uses Muse, Cue, Dots and Instinct. Specific agenda evidence determines inclusion. System 1 decision models are within Agent Harness; real-time voice or low latency alone does not qualify an event. Memory, context, retrieval and knowledge bases share `agent-memory`. Old `system-one` and `ai-search` paths redirect to their merged topics in both languages. Broad Enterprise AI and AI Fundraising topics remain removed; purpose filters remain available.

## Wishlist and community

The API Worker is `tech-week-wishlist`; the D1 database has the same name and binds as `DB`. `backend/worker.mjs`, `community.mjs`, `google-auth.mjs` and `schema.sql` implement the service.

Anonymous identities use random 256-bit credentials, kept in browser storage; the server stores hashes. Private recovery links use URL fragments, which are removed after reading. Optional read-only sharing links use separate revocable credentials. Public nickname lists expose neither credentials nor full Wishlist links. Counts deduplicate identities, not verified real people.

Wishlist saves retain a snapshot. Current event details are shown with change notices; removed events remain in saved lists. Address tips allow one editable, removable submission per identity and event, with a public nickname and timestamp. Ratings require self-confirmed attendance and an integer from 1 to 5 after the event starts. Editing replaces the previous rating. Shared read-only pages cannot write as the owner. User text is rendered as text, with parameterized queries, validation, rate limits, restricted CORS and no-store API responses.

The homepage fetches `/v1/community/stats` on load, return to the foreground and network recovery, and every 30 seconds while visible. The endpoint returns current address-tip and distinct-event totals only. Edits do not add duplicates; withdrawals reduce counts. This is the current retained total, not historical submissions. No AI tokens or redeployment are needed for changes.

## Optional Google sign-in

Google Identity Services loads only after the visitor clicks sign-in. The API verifies signatures, issuer, audience, expiry and a session-bound single-use nonce using Google’s public keys. The account key is Google `sub`; email is shown only to its owner. Google name, photo and email do not become the public nickname. No Gmail, contacts, calendar or Drive access is requested.

The first sign-in atomically merges the anonymous identity. Saves deduplicate, the newest address and rating per event win, and an existing account keeps its nickname. Merged anonymous recovery and sharing links are retired. Sessions last 30 days; sign-out revokes the current device’s session without deleting records. Privacy pages are `/privacy/` and `/zh/privacy/`.

The existing Google web client and allowed site origin are retained; no client secret is needed. Real Google sign-in was previously blocked by the Codex in-app browser’s refusal to load Google Identity Services. Cryptographic and merge tests pass; a full real-account browser sign-in remains a separate verification limitation.

## Release

Push to `main` to use the [GitHub Actions workflow](../.github/workflows/cloudflare.yml): verify, deploy API, deploy static site, then check both live homepages and public API endpoints. Normal deployments do not execute schema migrations or production test writes. Manual `npm run deploy:api` and `npm run deploy` are retained for recovery only. Deployment credentials live in GitHub Secrets, not source code. Local deployment evidence is excluded from Git.

## Contributing and licensing

See [contributor setup](../CONTRIBUTING.md), [architecture](../docs/architecture.md), [deployment configuration](../docs/deployment.md) and [security reporting](../SECURITY.md). A fresh checkout uses local URLs; deployment requires explicit configuration for your own resources. Code is MIT-licensed; third-party event material is covered separately in [NOTICE.md](../NOTICE.md).

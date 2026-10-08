# Architecture

The app uses a static website Worker plus a separate interaction API Worker backed by D1. There is no client framework or runtime translation service.

## Build and localization

`data.py` loads records and content from `TECH_WEEK_CONTENT_DIR`, or `examples/demo/` when unset. Public source owns the topic definitions and interface translations; the selected content supplies membership, descriptions and content-specific translations. Metadata is plain JSON; the build does not execute an older research script or modify Python's import path to load it.

`build.py` renders Jinja templates in a temporary directory. Ordinary template values are autoescaped; `Markup` is reserved for HTML assembled by internal helpers. JSON embedded in script elements escapes `<`, `>` and `&`. The output is swapped into `dist/` only after rendering and localization succeed. `.local/counts.json` and `backend/event-ids.mjs` are generated and excluded from Git.

`localize.py` derives English root routes and matching Chinese `/zh/` routes from shared data. Names, event IDs, times, source links, classification and ordering stay shared. `localize-js.mjs` parses browser JavaScript with Acorn and rewrites only string literals and template text. It escapes translated text according to its syntax and reports missing messages. Comments, identifiers and explicit Unicode data comparisons are not translated. Backend error strings are extracted through the same parser and serialized in sorted order.

`check_reproducible.py` runs two clean builds under different Python hash seeds and compares every file plus the API allowlist. `check.py` validates sources, topic boundaries, chronology, route integrity and English/Chinese parity. CSV exports escape spreadsheet formula prefixes in imported fields.

## Browser

- `locale.js`: language links, filter value mapping and API error copy.
- `app.js`: search, filtering, ordering, pagination and event rendering.
- `calendar.js`: shared date/address matching and multiday calendar expansion.
- `wishlist.js`: browser identity, saves, recovery and read-only sharing.
- `community.js`: address tips, attendance ratings and public totals.
- `google-login.js`: optional Google Identity Services flow.

Both languages share the same origin and storage key. The API URL is generated from deployment settings into a meta tag. Localhost previews always use `/api`, including when previewing a production build. Google scripts load only when the visitor asks to sign in.

## API

`worker.mjs` routes requests and composes response headers. `http.mjs` bounds streamed input, requires a JSON object and distinguishes expected client errors from service failures. `credentials.mjs` generates random bearer credentials and hashes them. `validation.mjs` checks unsafe control characters in public text. SQL statements bind user values.

`community.mjs` handles address and rating ownership, pagination and aggregates. `google-auth.mjs` verifies Google JWTs, manages one-use session-bound challenges, and atomically merges visitor records. `schema.sql` describes the database; deployment does not apply it automatically.

The browser keeps a random credential; the server stores its hash. Optional read-only sharing uses a different revocable token. Google sessions expire after 30 days. Merges preserve existing account nicknames, deduplicate saves, retain the newest per-event contribution and retire the merged anonymous credentials. Logout revokes the current session only.

Public responses expose nicknames and contributions, not emails, internal visitor IDs or recovery credentials. Identity counts are not unique-human counts, and attendance is self-reported. See [security](../SECURITY.md).

## Tests and operations

The local server uses Node's SQLite implementation through a small D1 adapter. Both preview commands bind loopback only; neither emulates Cloudflare's production `_headers` processing. Use a deployment preview to verify actual security headers. Tests exercise identity isolation, account merging and rollback, nonce replay, public/private boundaries, input limits, ownership, ratings, localization, escaping and rendering. External Google sign-in still requires a real configured browser for end-to-end confirmation; local cryptographic tests do not replace that check.

Production configuration is generated from explicit environment variables into ignored `.local/deploy/` files. GitHub Actions performs validation before deployment and uses read-only HTTP checks afterward. Source data refreshes are reviewed content changes; ordinary visitor activity never creates commits or triggers deployments.

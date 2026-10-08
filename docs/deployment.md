# Deploying your own copy

Use your own Cloudflare account, D1 database and, optionally, Google OAuth web client. The tracked Wrangler files contain no production account or database identifiers. Creating resources and applying schema are deliberate setup steps; routine CI does neither.

## One-time setup

1. Follow the [local setup](../CONTRIBUTING.md) and run verification.
2. Choose Worker names in `website/wrangler.jsonc` and `website/backend/wrangler.jsonc`. These files contain JSON compatible with Wrangler's JSONC format.
3. Use Wrangler to create a D1 database in your own account. Record its ID, generate your deployment configuration as below, and initialize this new database with `backend/schema.sql`. Do not import production visitor data into a development database.
4. For optional Google sign-in, register your website origin with your own Google OAuth web client. No Google client secret is used by this app.

## Configuration

| Variable                | Purpose                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `SITE_URL`              | Public HTTPS origin of the website; local default is `http://127.0.0.1:4173` |
| `API_URL`               | Public HTTPS origin of the API; local default is `/api`                      |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account identifier                                           |
| `D1_DATABASE_ID`        | Your existing, initialized D1 database identifier                            |
| `GOOGLE_CLIENT_ID`      | Optional OAuth web client ID; leave empty to disable sign-in                 |
| `CLOUDFLARE_API_TOKEN`  | Deployment credential; store as a secret, never in source                    |

Set the non-secret values as GitHub Actions repository **variables**, and the API token as the **production environment secret** `CLOUDFLARE_API_TOKEN`. Restrict that environment to the `main` branch. Set repository variable `CLOUDFLARE_DEPLOY_ENABLED=true` only after configuring your resources. Without that flag, the workflow runs checks and skips deployment.

The production repository already has these values configured. Its token permits Workers deployment in its Cloudflare account. Public account identifiers and OAuth client IDs are not credentials, but a fork must supply its own values. Secrets never enter the generated static website. The public site and API URLs intentionally appear in it.

For manual setup, export the same variables in your shell and run:

```sh
cd website
source .venv/bin/activate
npm run verify
npm run prepare:deploy
# Only for a new database that you intend to initialize:
npx wrangler d1 execute tech-week-wishlist --remote --config .local/deploy/api.wrangler.json --file backend/schema.sql
npx wrangler deploy --config .local/deploy/api.wrangler.json
npx wrangler deploy --config .local/deploy/site.wrangler.json
python3 scripts/check_deploy.py
```

If you changed the database name, substitute your name in the initialization command. `prepare:deploy` validates required identifiers and origins and writes ignored configuration files under `.local/deploy/`. It performs no network request or database operation. Google can be left disabled.

## Optional private content

The public validation job always uses fictional examples. To build an authorized private dataset in the deployment job, set repository variables `CONTENT_REPOSITORY` (`owner/repository`) and `CONTENT_REF` (an immutable 40-character commit SHA). Add a read-only SSH deploy key to that content repository and store its private half as `CONTENT_READ_KEY` in the production environment. The key should grant access only to the content repository, not the owner's other repositories. Do not reuse a personal GitHub token.

The production job checks out content under ignored `.private-content/`, selects it with `TECH_WEEK_CONTENT_DIR`, validates it, then deploys. The checkout is never uploaded as an artifact. Forks without these settings build the fictional demo; deployment still requires its explicit enable flag and Cloudflare configuration.

When moving an existing site to a new source repository, preserve Worker names, D1 IDs and OAuth settings. Verify the new pipeline against both live languages before disabling the old repository's deployment workflow. Keep the old repository private as a historical/content backup.

## Upgrading existing databases for transcript links

Before deploying code that shares recording transcripts, apply `website/backend/migrations/0001_transcript_links.sql` and then `0002_transcript_entries.sql` using an authorized database administrator session with D1 Edit access. From `website/`, after `npm run prepare:deploy`:

```sh
npx wrangler d1 execute DB --remote --config .local/deploy/api.wrangler.json --file backend/migrations/0001_transcript_links.sql
npx wrangler d1 execute DB --remote --config .local/deploy/api.wrangler.json --file backend/migrations/0002_transcript_entries.sql
```

These migrations add tables and indexes and copy existing links into individually addressable entries. They can be repeated without duplicating links or restoring withdrawn ones. Compatibility triggers mirror the original single-link slot while an older API or cached browser remains active. The new interface edits or withdraws individual entries; it also updates the legacy slot when applicable. Google merges transfer every entry and detach it from that slot before retiring the anonymous identity. New installations using the current `backend/schema.sql` already include these changes. The GitHub deployment token only needs Workers deployment access; do not grant it database administration access for routine releases.

## Normal releases

Push or merge to `main`. The workflow scans Git history, installs pinned dependencies, checks formatting and lint, verifies reproducible builds and runs tests. It then prepares configuration, deploys the API, deploys the site and verifies both language homepages plus public API responses.

Pull requests, including fork PRs, never receive deployment credentials or run deployment steps. A green run with skipped deploy steps means validation passed, not that anything was published. Runs on the same branch are serialized to avoid interleaved API/site releases.

No migration, database import, record deletion or test contribution runs automatically. Existing visitor data stays in D1 across deployments. When a schema change is needed, review and apply it separately before releasing dependent code.

For rollback, deploy a previously verified commit with the same configuration, or use Cloudflare's deployment history. Keep code and API compatibility in mind when rolling back one Worker independently. Never reset or replace the production database as a code rollback shortcut.

中文：fork 后默认只连接本地服务。线上部署需要自己的 Cloudflare 账号、D1 和可选 Google 客户端；普通部署只更新两个 Worker，不自动迁移或清空数据库。只有开启部署的 `main` 流水线会发布，PR 只验证。

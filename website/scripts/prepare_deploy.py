"""Create ignored Wrangler configs from explicit deployment settings. No network calls."""

import json
import os
import re
from pathlib import Path

from settings import API_URL, SITE_URL

ROOT = Path(__file__).resolve().parents[1]


def prepare():
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    database = os.environ.get("D1_DATABASE_ID", "")
    if not re.fullmatch(r"[a-f0-9]{32}", account):
        raise ValueError("Set CLOUDFLARE_ACCOUNT_ID for your own Cloudflare account")
    if (
        not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", database)
        or database == "00000000-0000-0000-0000-000000000000"
    ):
        raise ValueError("Set D1_DATABASE_ID to an existing, initialized database")
    if not SITE_URL.startswith("https://") or not API_URL.startswith("https://"):
        raise ValueError("Set public HTTPS SITE_URL and API_URL before deploying")
    output = ROOT / ".local/deploy"
    output.mkdir(parents=True, exist_ok=True)
    api = json.loads((ROOT / "backend/wrangler.jsonc").read_text(encoding="utf-8"))
    api["account_id"] = account
    api["main"] = str(ROOT / "backend/worker.mjs")
    api["d1_databases"][0]["database_id"] = database
    api["vars"].update(SITE_URL=SITE_URL, GOOGLE_CLIENT_ID=os.environ.get("GOOGLE_CLIENT_ID", ""))
    site = json.loads((ROOT / "wrangler.jsonc").read_text(encoding="utf-8"))
    site["account_id"] = account
    site["assets"]["directory"] = str(ROOT / "dist")
    for name, config in (("api", api), ("site", site)):
        (output / f"{name}.wrangler.json").write_text(
            json.dumps(config, indent=2) + "\n", encoding="utf-8"
        )
    print("Prepared deployment configs in .local/deploy (database migrations are not run)")


if __name__ == "__main__":
    prepare()

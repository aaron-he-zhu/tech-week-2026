"""Verify the published static artifact against the local build."""

import concurrent.futures
import hashlib
import json
import pathlib
import subprocess

from settings import SITE_URL

ROOT = pathlib.Path(__file__).resolve().parents[1]

BASE = SITE_URL
paths = [
    ("/" + str(p.relative_to(ROOT / "dist")).removesuffix("index.html"), p)
    for p in (ROOT / "dist").rglob("index.html")
]
paths += [
    ("/" + n, ROOT / "dist" / n)
    for n in [
        "assets/app.js",
        "assets/wishlist.js",
        "assets/community.js",
        "assets/google-login.js",
        "assets/style.css",
        "downloads/events.csv",
        "downloads/changes.csv",
    ]
]


def check(pair):
    url, p = pair
    r = subprocess.run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "30",
            "--header",
            "Cache-Control: no-cache",
            BASE + url,
        ],
        capture_output=True,
    )
    return {
        "path": url,
        "matches_local": r.returncode == 0 and r.stdout == p.read_bytes(),
        "sha256": hashlib.sha256(r.stdout).hexdigest(),
    }


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(check, paths))
removed = []
for path in ["/topics/enterprise-ai/", "/topics/ai-fundraising/"]:
    r = subprocess.run(
        [
            "curl",
            "--silent",
            "--output",
            "/dev/null",
            "--write-out",
            "%{http_code}",
            "--max-time",
            "30",
            BASE + path,
        ],
        capture_output=True,
        text=True,
    )
    removed.append({"path": path, "status": r.stdout})
redirects = []
for path, destination in {
    "/topics/system-one": "/topics/agent-harness/",
    "/topics/system-one/": "/topics/agent-harness/",
    "/topics/ai-search": "/topics/agent-memory/",
    "/topics/ai-search/": "/topics/agent-memory/",
}.items():
    r = subprocess.run(
        ["curl", "--silent", "--head", "--max-time", "30", BASE + path],
        capture_output=True,
        text=True,
    )
    headers = r.stdout.lower()
    assert [line for line in headers.splitlines() if line.startswith("http/")][-1].split()[
        1
    ] == "301", r.stdout
    assert "location: " + destination in headers or "location: " + BASE + destination in headers, (
        r.stdout
    )
    redirects.append({"path": path, "status": "301", "destination": destination})
(ROOT / "taxonomy-live-checks.json").write_text(
    json.dumps(
        {"content_checks": results, "removed_routes": removed, "redirected_routes": redirects},
        indent=2,
    ),
    encoding="utf-8",
)
assert all(r["matches_local"] for r in results), [r for r in results if not r["matches_local"]]
assert all(r["status"] == "404" for r in removed), removed
print(
    f"PASS: {len(results)} live pages/assets match the build; removed routes return 404 and merged topic routes redirect correctly."
)

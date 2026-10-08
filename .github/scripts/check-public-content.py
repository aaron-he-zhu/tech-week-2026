"""Keep private snapshots, runtime state and credentials out of the public tree."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
files = (
    subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
)
allowed_src = {"topics.json", "calendar-labels.json", "locales/en.json"}
for name in filter(None, files):
    path = Path(name)
    assert not set(path.parts) & {
        "node_modules",
        ".local",
        ".venv",
        ".wrangler",
        ".private-content",
    }, name
    assert not name.startswith(("data/", "website/dist/")), name
    assert not path.name.startswith((".env", ".dev.vars")), name
    assert path.suffix not in {".sqlite", ".sqlite3", ".db", ".pem", ".key"}, name
    assert path.suffix != ".csv" or name.startswith("examples/demo/"), name
    if name.startswith("website/src/"):
        assert name.removeprefix("website/src/") in allowed_src, name
for city in ("sf", "la"):
    records = json.loads((ROOT / f"examples/demo/data/{city}_events.json").read_text())
    assert all(
        event["name"].startswith("Demo:") and event["hosts"] == ["Example Community"]
        for event in records
    )
assert (
    json.loads((ROOT / "examples/demo/website/src/snapshot.json").read_text())["demo"]
    is True
)
print("PASS: tracked public tree contains source and fictional examples only.")

"""Load an explicit private content checkout, or the bundled fictional demo."""

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = Path(os.environ.get("TECH_WEEK_CONTENT_DIR") or ROOT.parent / "examples/demo").resolve()
CONTENT_SRC = BASE / "website/src"
TOPICS = json.loads((ROOT / "src/topics.json").read_text(encoding="utf-8"))


def content_json(relative, default=None):
    path = CONTENT_SRC / relative
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


EVENTS = json.loads((BASE / "data/sf_events.json").read_text(encoding="utf-8")) + json.loads(
    (BASE / "data/la_events.json").read_text(encoding="utf-8")
)
SNAPSHOT = content_json("snapshot.json")
if not SNAPSHOT:
    raise ValueError("Content requires website/src/snapshot.json")
DEMO = SNAPSHOT.get("demo", False)
detail_path = (BASE / SNAPSHOT["detail_source"]).resolve()
if not detail_path.is_relative_to(BASE):
    raise ValueError("Description source must stay inside the configured content directory")
DETAILS = {e["id"]: e for e in json.loads(detail_path.read_text(encoding="utf-8"))}
CONSTANTS = json.loads((ROOT / "src/calendar-labels.json").read_text(encoding="utf-8"))
CONSTANTS.update(content_json("calendar-labels.json", {}))
NOTES = {**CONSTANTS.get("notes", {}), **content_json("briefs.json", {})}
ids = {e["id"] for e in EVENTS}
NOTES = {uid: note for uid, note in NOTES.items() if uid in ids}
MEMBERSHIP = content_json("topic_membership.json")
assert set(MEMBERSHIP) == {t["slug"] for t in TOPICS}, "Every topic requires reviewed membership"
LUMA = content_json("luma_links.json", {})


def match(event, topic):
    # Publication uses reviewed membership, never broad theme/tag fallback.
    return MEMBERSHIP[topic["slug"]].get(event["id"])


def matched(topic):
    results = [(event, match(event, topic)) for event in EVENTS if match(event, topic)]
    return sorted(
        results,
        key=lambda pair: (
            -pair[1]["score"],
            -int(pair[0]["isFeatured"]),
            pair[0]["date"],
            pair[0]["startTime"],
            pair[0]["id"],
        ),
    )

"""Check coverage, route integrity and published data against the source snapshot."""

import json
from html.parser import HTMLParser
from urllib.parse import urlsplit

from data import (
    BASE,
    DEMO,
    DETAILS,
    EVENTS,
    MEMBERSHIP,
    NOTES,
    ROOT,
    SNAPSHOT,
    TOPICS,
    content_json,
)


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links = []
        self.json_text = ""
        self.in_json = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("a", "link", "script"):
            url = a.get("href") or a.get("src")
            if url:
                self.links.append(url)
        if tag == "script" and a.get("id") == "page-data":
            self.in_json = True

    def handle_data(self, text):
        if self.in_json:
            self.json_text += text

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_json = False

    @property
    def data(self):
        return json.loads(self.json_text) if self.json_text else None


out = ROOT / "dist"
ids = {e["id"] for e in EVENTS}
assert len(EVENTS) == len(ids) == SNAPSHOT["calendar_records"]
assert set(DETAILS) == ids
assert sum(e["citySlug"] == "sf" for e in EVENTS) == SNAPSHOT["cities"]["sf"]
assert sum(e["citySlug"] == "la" for e in EVENTS) == SNAPSHOT["cities"]["la"]
assert len(TOPICS) == len({t["slug"] for t in TOPICS}) == 30
assert set(NOTES) <= ids and set(NOTES) <= set(DETAILS)
home = Page((out / "index.html").read_text(encoding="utf-8")).data
assert len(home["topics"]) == 30
all_events = Page((out / "events/index.html").read_text(encoding="utf-8")).data["events"]
assert {e["id"] for e in all_events} == ids
for topic in TOPICS:
    es = Page((out / "topics" / topic["slug"] / "index.html").read_text(encoding="utf-8")).data[
        "events"
    ]
    assert len(es) == len({e["id"] for e in es})
    assert {e["id"] for e in es} <= ids
    count = next(t for t in home["topics"] if t["slug"] == topic["slug"])
    assert count["total"] == len(es) == count["sf"] + count["la"]
    assert count["direct"] == sum(e["match"]["kind"] == "direct" for e in es)
    for e in es:
        assert urlsplit(e["url"]).scheme == "https"
        assert urlsplit(e["url"]).hostname in ("www.tech-week.com", "tech-week.com")
for path in out.rglob("*.html"):
    page = Page(path.read_text(encoding="utf-8"))
    for url in page.links:
        if url.startswith("/"):
            target = out / urlsplit(url).path.lstrip("/")
            if target.is_dir():
                target = target / "index.html"
            assert target.is_file(), f"Broken link: {path} -> {url}"
assert len(list(out.rglob("*.html"))) == 74
assert not list(out.rglob("*.py")) and not list(out.rglob("*.json"))
print(
    f"PASS: {len(EVENTS):,} unique events, 30 topic pages, editorial sources, counts and all internal links."
)

if not DEMO:
    companions = Page((out / "topics/ai-companions/index.html").read_text(encoding="utf-8")).data[
        "events"
    ]
    assistants = Page(
        (out / "topics/personal-assistants/index.html").read_text(encoding="utf-8")
    ).data["events"]
    cids = {e["id"] for e in companions}
    aids = {e["id"] for e in assistants}
    assert "7f5c84ce-5c89-4eae-993d-6b987a53be5a" in cids - aids  # Zeta
    assert "cc0345c8-42b5-4f20-8034-797b7abfdad2" in aids - cids  # Cue
    assert "b678f512-e974-431f-ae62-c34ddb275efa" in aids - cids  # Muse / Instinct examples
    assert "d86b8a13-d49c-4e07-9993-70f734fb29f0" not in aids  # Dots payouts company
    assert "910e21d3-068b-4d3e-927d-d38a69701e6e" not in aids  # Human Chief of Staff
    assert all(
        "带着问题" not in p.read_text(encoding="utf-8")
        and "带着这三个问题" not in p.read_text(encoding="utf-8")
        for p in out.rglob("*.html")
    )
    print("PASS: companion/assistant boundaries and neutral page copy.")

    # The merged event appears once in Harness; its source audit survives without a separate topic.
    harness_page = (out / "topics/agent-harness/index.html").read_text(encoding="utf-8")
    harness = Page(harness_page).data["events"]
    assert sum(e["id"] == "b678f512-e974-431f-ae62-c34ddb275efa" for e in harness) == 1
    assert len(harness) == len({e["id"] for e in harness})
    assert not (out / "topics/system-one").exists()
    assert "system-one" not in {t["slug"] for t in home["topics"]}
    assert "Jev and Laya" in harness_page and 'id="system-one-review"' in harness_page
    assert (
        "https://luma.com/5gcvcaoc" in harness_page
        and "https://luma.com/builde-pozq" in harness_page
    )
    assert "/topics/system-one/ /topics/agent-harness/ 301" in (out / "_redirects").read_text(
        encoding="utf-8"
    )
    print(
        "PASS: decision-model event merged once, audit and leads preserved, old route redirected."
    )


# Context-sensitive regressions for the taxonomy rewrite.

if not DEMO:
    full = json.loads(
        (BASE / "data/system_one_audit/complete_descriptions.json").read_text(encoding="utf-8")
    )

    def uid(n):
        return full[n]["id"]

    for slug, n in [
        ("ai-finance", 112),
        ("post-training", 280),
        ("post-training", 979),
        ("agent-harness", 2308),
        ("inference-compute", 60),
        ("inference-compute", 1465),
        ("ai-video", 2158),
        ("ai-games", 2158),
        ("robotics", 522),
        ("robotics", 2236),
        ("coding-agents", 2161),
        ("ai-music", 1056),
        ("agent-memory", 808),
    ]:
        assert uid(n) not in MEMBERSHIP[slug], (slug, n)
    for slug, n in [
        ("ai-bio", 436),
        ("world-models", 436),
        ("ai-games", 1056),
        ("vibe-coding", 1056),
        ("geo-aeo", 808),
        ("ai-companions", 1765),
        ("personal-assistants", 1125),
    ]:
        assert uid(n) in MEMBERSHIP[slug], (slug, n)
    assert all(uid(1925) not in entries for entries in MEMBERSHIP.values())

assert not (out / "topics/enterprise-ai").exists() and not (out / "topics/ai-fundraising").exists()
assert all("相邻议题" not in p.read_text(encoding="utf-8") for p in out.rglob("*.html"))
assert [t["total"] for t in home["topics"]] == sorted(
    [t["total"] for t in home["topics"]], reverse=True
)
for topic in TOPICS:
    es = Page((out / "topics" / topic["slug"] / "index.html").read_text(encoding="utf-8")).data[
        "events"
    ]
    assert [(e["date"], e["time"], e["name"]) for e in es] == sorted(
        (e["date"], e["time"], e["name"]) for e in es
    )
    assert set(MEMBERSHIP[topic["slug"]]) == {e["id"] for e in es}
    for uid_, membership in MEMBERSHIP[topic["slug"]].items():
        source = DETAILS[uid_]

        def flatten(value):
            return " ".join(value.split())

        assert flatten(membership["evidence"]) in flatten(
            source["name"] + " " + (source["description"] or "")
        ), (topic["slug"], uid_)
for e, source in zip(
    sorted(all_events, key=lambda x: x["id"]), sorted(EVENTS, key=lambda x: x["id"]), strict=False
):
    assert ("fundraising" in e["purposes"]) == ("Fundraising / Investing" in source["themes"])
    assert ("pitch" in e["purposes"]) == ("Pitch Event / Demo Day" in source["formats"])
    assert ("investor-networking" in e["purposes"]) == (
        "Fundraising / Investing" in source["themes"]
        and bool(set(source["formats"]) & {"Networking", "Matchmaking"})
    )
print(
    "PASS: contextual exclusions, new topic inclusions, original evidence, chronological order and purpose filters."
)

# Merging preserves the union, with four shared events counted once.
if not DEMO:
    original = json.loads(
        (BASE / "data/taxonomy_before_memory_merge/src/topic_membership.json").read_text(
            encoding="utf-8"
        )
    )
    expected = set(original["agent-memory"]) | set(original["ai-search"])
    knowledge = Page((out / "topics/agent-memory/index.html").read_text(encoding="utf-8")).data[
        "events"
    ]
    assert expected & ids <= {e["id"] for e in knowledge}

knowledge = Page((out / "topics/agent-memory/index.html").read_text(encoding="utf-8")).data[
    "events"
]
assert len(knowledge) == len({e["id"] for e in knowledge})
assert not (out / "topics/ai-search").exists()
assert "ai-search" not in {t["slug"] for t in home["topics"]}
assert "/topics/ai-search/ /topics/agent-memory/ 301" in (out / "_redirects").read_text(
    encoding="utf-8"
)
print(
    "PASS: memory/knowledge union retained, shared events deduplicated, retrieval route redirected."
)

refresh = content_json("refresh.json")
assert refresh["total"] == len(EVENTS)
assert {e["id"] for e in refresh["new"]} <= ids
assert not ({e["id"] for e in refresh["removed"]} & ids)
assert {e["id"] for e in refresh["changed"]} <= ids
assert SNAPSHOT["checked_local"] in (out / "index.html").read_text(encoding="utf-8")
assert "2026.10.03" not in (out / "index.html").read_text(encoding="utf-8")
print("PASS: refresh log, full-description coverage and snapshot timestamp.")

# Locale routes share event identity, taxonomy, schedules and counts.
for english in out.rglob("*.html"):
    if "zh" in english.relative_to(out).parts:
        continue
    chinese = out / "zh" / english.relative_to(out)
    en_text = english.read_text(encoding="utf-8")
    zh_text = chinese.read_text(encoding="utf-8")
    assert '<html lang="en">' in en_text and '<html lang="zh-CN">' in zh_text
    assert 'hreflang="en"' in en_text and 'hreflang="zh-CN"' in en_text
    assert 'data-language="en"' in en_text and 'data-language="zh"' in zh_text
    en = Page(en_text).data
    zh = Page(zh_text).data
    if en and "events" in en:

        def invariant(events):
            return [
                tuple(e[k] for k in ("id", "date", "time", "endDate", "endTime", "status", "url"))
                for e in events
            ]

        assert invariant(en["events"]) == invariant(zh["events"]), english
        assert [e["searchText"] for e in en["events"]] == [e["searchText"] for e in zh["events"]], (
            english
        )
    if en and "topics" in en:
        assert [(t["slug"], t["total"]) for t in en["topics"]] == [
            (t["slug"], t["total"]) for t in zh["topics"]
        ]
print(
    "PASS: 37 English and 37 Chinese pages preserve event identity, counts, order and language links."
)

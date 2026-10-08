"""Build English-default and Chinese routes from shared data and message catalogs.

Translations are compiled once; visitors never call a translation service.
Organizer titles, nicknames and contributions are kept in their original language.
"""

import csv
import html
import json
import re
import shutil
import subprocess
from html.parser import HTMLParser

from data import CONSTANTS, EVENTS, NOTES, ROOT, TOPICS, content_json
from rendering import csv_safe
from settings import SITE_URL as SITE

CJK = re.compile(r"[\u3400-\u9fff]")
CATALOG = json.loads((ROOT / "src/locales/en.json").read_text(encoding="utf-8"))
CATALOG.update(content_json("locales/en.json", {}))
# Field labels are official English values in the source calendar.
CATALOG.update({v: k for group in ("F", "T") for k, v in CONSTANTS[group].items()})
for t in TOPICS:
    CATALOG.setdefault(
        t["name"],
        t["en"]
        .title()
        .replace("Ai", "AI")
        .replace("Mcp", "MCP")
        .replace("Xr", "XR")
        .replace("Geo", "GEO")
        .replace("Aeo", "AEO"),
    )
ORIGINAL_NAMES = {e["name"] for e in EVENTS} | {h for e in EVENTS for h in e["hosts"]}
BRIEFS = {}
for e in EVENTS:
    n = NOTES.get(e["id"])
    if n:
        # Translate the same editorial summary in both languages.
        BRIEFS[n[0]] = CATALOG[n[0]]
    else:
        theme = "、".join(CONSTANTS["T"].get(x, x) for x in e["themes"][:3])
        forms = [CONSTANTS["F"].get(x, x) for x in e["formats"]]
        old = ("围绕" + theme + "展开交流。" if theme else "") + (
            "活动形式为" + "、".join(forms[:2]) + "。" if forms else "具体内容见主办方介绍。"
        )
        BRIEFS[old] = ("An event about " + ", ".join(e["themes"][:3]) + ". " if theme else "") + (
            "Format: " + ", ".join(e["formats"][:2]) + "."
            if forms
            else "See the organizer’s event page for details."
        )
CATALOG.update(BRIEFS)
KEYS = sorted(CATALOG, key=len, reverse=True)
PATTERN = re.compile("|".join(re.escape(k) for k in KEYS))
MISSING = set()


def translate(text, strict=True):
    if not text or text in ORIGINAL_NAMES:
        return text
    translated = PATTERN.sub(lambda m: CATALOG[m[0]], text)
    if strict and CJK.search(translated):
        MISSING.add(text)
    return translated


def local_path(path, lang):
    if not path.startswith("/") or path.startswith("//") or path.startswith("/assets/"):
        return path
    return ("/zh" + path) if lang == "zh" else path


def search_text(event):
    values = [event.get("brief", ""), event.get("note", ""), *event.get("themes", [])]
    return " ".join(values + [translate(v) for v in values])


def event_en(event):
    result = dict(event)
    for key in ("brief", "note", "place"):
        result[key] = translate(event.get(key, ""))
    for key in ("themes", "formats"):
        result[key] = [translate(x) for x in event.get(key, [])]
    if result.get("match"):
        result["match"] = {
            **result["match"],
            "terms": [translate(x) for x in result["match"]["terms"]],
        }
    # Search both languages without displaying duplicate descriptions.
    result["searchText"] = search_text(event)
    return result


class LocalPage(HTMLParser):
    def __init__(self, text, path, lang, version):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.path = path
        self.lang = lang
        self.version = version
        self.script = False
        self.page_json = False
        self.feed(text)

    def handle_decl(self, d):
        self.out.append("<!" + d + ">")

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            a["lang"] = "en" if self.lang == "en" else "zh-CN"
        if tag == "script":
            self.script = True
            self.page_json = a.get("id") == "page-data"
        for key, value in list(a.items()):
            if value is None:
                continue
            if key == "href":
                a[key] = local_path(value, self.lang)
            if (
                key == "src"
                and value.startswith("/assets/")
                and value.split("?")[0].endswith(".js")
                and self.lang == "en"
            ):
                a[key] = value.replace("/assets/", "/assets/en/", 1)
            if self.lang == "en" and key in (
                "aria-label",
                "placeholder",
                "title",
                "alt",
                "content",
                "data-group",
                "value",
            ):
                a[key] = translate(value)
        self.out.append(
            "<"
            + tag
            + "".join(
                " " + k + ('="' + html.escape(v, quote=True) + '"' if v is not None else "")
                for k, v in a.items()
            )
            + ">"
        )
        if tag == "header":
            en = self.path
            zh = "/zh" + self.path
            self.out.append(
                '<nav class="language-switch" aria-label="'
                + ("Language" if self.lang == "en" else "语言")
                + '">'
                + "".join(
                    '<a data-language="'
                    + code
                    + '" lang="'
                    + ("zh-CN" if code == "zh" else "en")
                    + '" href="'
                    + url
                    + '"'
                    + (' aria-current="true"' if code == self.lang else "")
                    + ">"
                    + label
                    + "</a>"
                    for code, url, label in [("en", en, "EN"), ("zh", zh, "中文")]
                )
                + "</nav>"
            )
        if tag == "head":
            self.out.append(
                f'<link rel="canonical" href="{SITE + local_path(self.path, self.lang)}"><link rel="alternate" hreflang="en" href="{SITE + self.path}"><link rel="alternate" hreflang="zh-CN" href="{SITE}/zh{self.path}"><link rel="alternate" hreflang="x-default" href="{SITE + self.path}"><script src="/assets/locale.js?v={self.version}" defer></script>'
            )

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "script":
            self.script = False
            self.page_json = False
        self.out.append("</" + tag + ">")

    def handle_data(self, s):
        if self.page_json:
            data = json.loads(s)
            if self.lang == "zh":
                if "events" in data:
                    for e in data["events"]:
                        e["searchText"] = search_text(e)
                if "topics" in data:
                    for t in data["topics"]:
                        t["searchText"] = translate(t["description"])
            if self.lang == "en":
                if "events" in data:
                    data["events"] = [event_en(e) for e in data["events"]]
                if "topics" in data:
                    for t in data["topics"]:
                        t["searchText"] = t["name"] + " " + t["description"]
                        for k in ("name", "description", "group"):
                            t[k] = translate(t[k])
            self.out.append(
                json.dumps(data, ensure_ascii=False, separators=(",", ":"))
                .replace("<", "\\u003c")
                .replace(">", "\\u003e")
                .replace("&", "\\u0026")
            )
        else:
            self.out.append(
                s
                if self.script
                else html.escape(s if self.lang == "zh" else translate(s), quote=False)
            )

    def handle_entityref(self, name):
        self.out.append("&" + name + ";")

    def handle_charref(self, name):
        self.out.append("&#" + name + ";")

    def handle_comment(self, s):
        self.out.append("<!--" + s + "-->")


def build_locales(version, out=None):
    MISSING.clear()
    out = out or ROOT / "dist"
    if (out / "zh").exists():
        shutil.rmtree(out / "zh")
    originals = sorted(out.rglob("*.html"))
    for p in originals:
        relative = p.relative_to(out)
        route = "/" + str(relative).removesuffix("index.html")
        text = p.read_text(encoding="utf-8")
        for lang in ("zh", "en"):
            target = out / "zh" / relative if lang == "zh" else p
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("".join(LocalPage(text, route, lang, version).out), encoding="utf-8")
    # Compile English UI strings into separate bundles; all interaction logic is shared.
    (out / "assets/en").mkdir(exist_ok=True)
    browser_sources = {
        p.name: p.read_text(encoding="utf-8")
        for p in sorted((ROOT / "public/assets").glob("*.js"))
        if p.name != "locale.js"
    }
    backend_sources = {
        p.name: p.read_text(encoding="utf-8")
        for p in sorted((ROOT / "backend").glob("*.mjs"))
        if p.name != "event-ids.mjs"
    }
    result = subprocess.run(
        ["node", str(ROOT / "scripts/localize-js.mjs")],
        input=json.dumps(
            {
                "catalog": CATALOG,
                "browserSources": browser_sources,
                "backendSources": backend_sources,
            }
        ),
        encoding="utf-8",
        capture_output=True,
        check=True,
    )
    compiled = json.loads(result.stdout)
    for name, item in compiled["files"].items():
        (out / "assets/en" / name).write_text(item["code"], encoding="utf-8")
        MISSING.update(item["missing"])
    runtime = (ROOT / "public/assets/locale.js").read_text(encoding="utf-8")
    messages = {message: translate(message) for message in compiled["messages"]}
    maps = {
        "ERROR_MESSAGES": messages,
        "FORMAT_MESSAGES": {v: k for k, v in CONSTANTS["F"].items()},
        "GROUP_MESSAGES": {t["group"]: translate(t["group"]) for t in TOPICS},
    }
    for marker, values in maps.items():
        runtime, count = re.subn(
            r"/\*" + marker + r"\*/\s*\{\s*\}",
            lambda _m, values=values: json.dumps(values, ensure_ascii=False, sort_keys=True),
            runtime,
        )
        if count != 1:
            raise ValueError(f"Missing locale placeholder: {marker}")
    (out / "assets/locale.js").write_text(runtime, encoding="utf-8")
    # English downloads use source field values; the original Chinese CSV stays available.
    (out / "zh/downloads").mkdir(parents=True, exist_ok=True)
    for p in (out / "downloads").glob("*.csv"):
        shutil.copyfile(p, out / "zh/downloads" / p.name)
    with (out / "downloads/events.csv").open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "ID",
                "City",
                "Event",
                "Start date",
                "Start time (PDT)",
                "End date",
                "End time (PDT)",
                "Hosts",
                "Themes",
                "Formats",
                "Area",
                "Registration",
                "Official URL",
            ]
        )
        for e in EVENTS:
            writer.writerow(
                [
                    csv_safe(value)
                    for value in [
                        e["id"],
                        e["citySlug"].upper(),
                        e["name"],
                        e["date"],
                        e["startTime"],
                        e["endDate"],
                        e["endTime"],
                        " / ".join(e["hosts"]),
                        " / ".join(e["themes"]),
                        " / ".join(e["formats"]),
                        " / ".join(e["neighborhoods"]),
                        e["registration"],
                        e["eventUrl"].split("?")[0],
                    ]
                ]
            )
    # Translate the existing change export without altering its row structure.
    with (out / "zh/downloads/changes.csv").open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    with (out / "downloads/changes.csv").open("w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f).writerows([[csv_safe(translate(v)) for v in row] for row in rows])
    redirects = (out / "_redirects").read_text(encoding="utf-8")
    for line in redirects.splitlines():
        if line.startswith("/topics/"):
            bits = line.split()
            redirects += "\n/zh" + bits[0] + " /zh" + bits[1] + " " + bits[2]
    (out / "_redirects").write_text(redirects + "\n", encoding="utf-8")
    if MISSING:
        (ROOT / ".local").mkdir(exist_ok=True)
        (ROOT / ".local/missing-translations.json").write_text(
            json.dumps(sorted(MISSING), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        raise RuntimeError(
            f"{len(MISSING)} untranslated messages; see .local/missing-translations.json"
        )
    print("PASS: English default and Chinese routes built; all UI messages translated.")

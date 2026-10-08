import gzip
import hashlib
import html
import json
import shutil
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

from markupsafe import Markup

from data import (
    BASE,
    CONSTANTS,
    DEMO,
    DETAILS,
    EVENTS,
    LUMA,
    NOTES,
    ROOT,
    SNAPSHOT,
    TOPICS,
    content_json,
    matched,
)
from home_calendar import calendar_weeks
from localize import CATALOG, build_locales
from rendering import json_for_script, render_template, safe_csv_copy
from settings import API_URL
from system_one_review import REVIEW, review_section
from updates import render_updates


def _publish(output):
    destination = ROOT / "dist"
    backup = ROOT / ".local/dist-previous"
    if backup.exists():
        shutil.rmtree(backup)
    if destination.exists():
        destination.rename(backup)
    try:
        output.rename(destination)
    except OSError:
        if backup.exists():
            backup.rename(destination)
        raise
    if backup.exists():
        shutil.rmtree(backup)


def main():
    (ROOT / ".local").mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="build-", dir=ROOT / ".local") as stage:
        OUT = Path(stage) / "dist"
        OUT.mkdir(exist_ok=True)
        shutil.copytree(ROOT / "public", OUT, dirs_exist_ok=True)
        ASSET_VERSION = hashlib.sha256(
            (ROOT / "public/assets/style.css").read_bytes()
            + (ROOT / "public/assets/app.js").read_bytes()
            + (ROOT / "public/assets/calendar.js").read_bytes()
            + (ROOT / "public/assets/wishlist.js").read_bytes()
            + (ROOT / "public/assets/community.js").read_bytes()
            + (ROOT / "public/assets/google-login.js").read_bytes()
            + (ROOT / "public/assets/locale.js").read_bytes()
            + json.dumps(CATALOG, ensure_ascii=False, sort_keys=True).encode()
            + (ROOT / "scripts/localize.py").read_bytes()
            + (ROOT / "scripts/localize-js.mjs").read_bytes()
        ).hexdigest()[:10]

        def escape_html(x):
            return html.escape(str(x or ""), quote=True)

        SYMBOLS = [
            "▷",
            "◌",
            "↗",
            "✳",
            "⌘",
            "≈",
            "◎",
            "⌁",
            "⋈",
            "▦",
            "⌖",
            "⊞",
            "▥",
            "◇",
            "⌕",
            "◒",
            "♪",
            "⬡",
            "✚",
            "⊙",
            "⇄",
            "✦",
            "↗",
            "◈",
            "◇",
            "⊕",
            "↔",
            "⌘",
            "◉",
            "↟",
        ]
        GROUPS = list(dict.fromkeys(t["group"] for t in TOPICS))
        MATCHES = {t["slug"]: matched(t) for t in TOPICS}
        COUNTS = {
            s: {
                "total": len(ms),
                "sf": sum(e["citySlug"] == "sf" for e, m in ms),
                "la": sum(e["citySlug"] == "la" for e, m in ms),
                "direct": sum(m["kind"] == "direct" for e, m in ms),
            }
            for s, ms in MATCHES.items()
        }
        SORTED_TOPICS = sorted(TOPICS, key=lambda t: -COUNTS[t["slug"]]["total"])
        F = CONSTANTS["F"]
        T = CONSTANTS["T"]
        TOTAL = len(EVENTS)
        SF = sum(e["citySlug"] == "sf" for e in EVENTS)
        LA = TOTAL - SF
        STAMP = SNAPSHOT["date"].replace("-", ".")
        SHORT_STAMP = STAMP[5:]
        NONEMPTY = sum(bool(e.get("description")) for e in DETAILS.values())
        REFRESH = content_json("refresh.json")

        def purposes(e):
            values = []
            if "Fundraising / Investing" in e["themes"]:
                values.append("fundraising")
            if "Pitch Event / Demo Day" in e["formats"]:
                values.append("pitch")
            if "fundraising" in values and set(e["formats"]) & {"Networking", "Matchmaking"}:
                values.append("investor-networking")
            return values

        def normalize(e, m=None):
            n = NOTES.get(e["id"])
            theme = "、".join(T.get(x, x) for x in e["themes"][:3])
            forms = [F.get(x, x) for x in e["formats"]]
            fallback = ("围绕" + theme + "展开交流。" if theme else "") + (
                "活动形式为" + "、".join(forms[:2]) + "。" if forms else "具体内容见主办方介绍。"
            )
            return dict(
                id=e["id"],
                name=e["name"],
                city=e["citySlug"],
                date=e["date"],
                time=e["startTime"],
                endDate=e["endDate"],
                endTime=e["endTime"],
                hosts=e["hosts"],
                place=" · ".join(e["neighborhoods"]) or "地点待确认",
                themes=[T.get(x, x) for x in e["themes"]],
                formats=forms,
                status=e["registration"],
                featured=e["isFeatured"],
                url=e["eventUrl"].split("?")[0],
                brief=n[0] if n else fallback,
                note=" ".join(
                    x for x in [(n[1] if n else ""), LUMA.get(e["id"], {}).get("note", "")] if x
                ),
                reviewed=bool(n),
                lumaUrl=LUMA.get(e["id"], {}).get("url"),
                purposes=purposes(e),
                match={k: m[k] for k in ["kind", "score", "terms"]} if m else None,
            )

        def nav(active, mobile=False):
            links = [
                ("/", "专题", "◫", "topics"),
                ("/events/", "全部活动", "≡", "events"),
                ("/wishlist/", "Wishlist <b data-wishlist-count></b>", "♡", "wishlist"),
                ("/guide/", "参会指南", "⌁", "guide"),
            ]
            return (
                '<nav aria-label="'
                + ("手机导航" if mobile else "主导航")
                + '" class="'
                + ("mobile-nav" if mobile else "desktop-nav")
                + '">'
                + "".join(
                    f'<a href="{u}"'
                    + (' aria-current="page"' if active == k else "")
                    + ">"
                    + (f'<span aria-hidden="true">{icon}</span>' if mobile else "")
                    + n
                    + "</a>"
                    for u, n, icon, k in links
                )
                + "</nav>"
            )

        def layout(title, description, body, active="topics", data=None, accent="#a85332"):
            return render_template(
                "layout.html",
                api_url=API_URL,
                demo=DEMO,
                title=title,
                description=description,
                asset_version=ASSET_VERSION,
                accent=accent,
                navigation_html=Markup(nav(active)),
                body_html=Markup(body),
                snapshot_timestamp=SNAPSHOT["checked_local"],
                mobile_navigation_html=Markup(nav(active, True)),
                page_data_html=Markup(
                    '<script id="page-data" type="application/json">'
                    + json_for_script(data)
                    + "</script>"
                    if data
                    else ""
                ),
            )

        def city_tabs():
            return '<div class="segments" role="group" aria-label="选择城市"><button data-city="all" aria-pressed="true">全部城市</button><button data-city="sf" aria-pressed="false">SF</button><button data-city="la" aria-pressed="false">LA</button></div>'

        def search(id, placeholder):
            return f'<div class="search-wrap"><span aria-hidden="true">⌕</span><label for="{id}" class="sr-only">{placeholder}</label><input type="search" id="{id}" class="search" placeholder="{placeholder}" autocomplete="off"></div>'

        (OUT / "assets/favicon.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#252b26"/><path d="M8 12h13v4h-4v12h-5V16H8m14-4h4l2 10 2-10h4l-4 16h-4z" fill="#f6f3e6"/></svg>',
            encoding="utf-8",
        )
        cards = []
        for t in SORTED_TOPICS:
            i = TOPICS.index(t)
            c = COUNTS[t["slug"]]
            teaser = t["description"].split("。")[0] + "。"
            lead_note = (
                f'<span class="topic-leads">决策模型：{len(REVIEW["leads"])} 条 Luma 线索</span>'
                if t["slug"] == "agent-harness" and REVIEW
                else ""
            )
            cards.append(
                f'''<a class="topic-card {"first-six" if i < 6 else ""}" data-slug="{t["slug"]}" href="/topics/{t["slug"]}/" style="--accent:{t["color"]}"><div class="topic-card-top"><span class="topic-number">FIELD {i + 1:02}</span><span class="topic-symbol" aria-hidden="true">{SYMBOLS[i]}</span></div><h3>{escape_html(t["name"])}</h3><div class="english">{escape_html(t["en"])}</div><p class="desc">{escape_html(teaser)}</p><div class="topic-foot"><span><b class="count">{c["total"]}</b> 场相关活动<span class="city-tiny">SF {c["sf"]} / LA {c["la"]}</span>{lead_note}</span><span class="arrow" aria-hidden="true">↗</span></div></a>'''
            )
        home = render_template(
            "home.html",
            total_count=format(TOTAL, ","),
            topic_count=len(TOPICS),
            updated_short=SHORT_STAMP,
            sf_count=format(SF, ","),
            la_count=format(LA, ","),
            calendar_weeks=calendar_weeks(EVENTS),
            city_tabs_html=Markup(city_tabs()),
            search_html=Markup(search("topic-search", "搜索专题，如 视频、Harness")),
            category_tabs_html=Markup(
                "".join(
                    (
                        '<button data-group="'
                        + escape_html(g)
                        + '" aria-pressed="false">'
                        + g
                        + "</button>"
                        for g in GROUPS
                    )
                )
            ),
            cards_html=Markup("".join(cards)),
        )
        (OUT / "index.html").write_text(
            layout(
                "Tech Week 2026 SF · LA 活动指南",
                f"Tech Week 2026 SF 与 LA 中文指南。按 {len(TOPICS)} 个主题探索活动、日期、主办方与报名入口。",
                home,
                data={
                    "type": "home",
                    "topics": [
                        {
                            **{k: t[k] for k in ["slug", "name", "en", "description", "group"]},
                            **COUNTS[t["slug"]],
                        }
                        for t in SORTED_TOPICS
                    ],
                },
            ),
            encoding="utf-8",
        )

        def event_card(e):
            status = {
                "open": "开放申请",
                "waitlist": "候补",
                "full": "已满",
                "closed": "已关闭",
            }.get(e["status"], "待确认")
            m = e["match"]
            match = (
                "相关主题" + " · " + " / ".join(m["terms"])
                if m
                else ("官网精选" if e["featured"] else " · ".join(e["formats"][:2]))
            )
            return f'''<article class="event-card" data-event-id="{e["id"]}"><div class="event-meta"><span class="date-label">{e["date"][5:].replace("-", "/")} · {e["time"]}</span><span class="pill {e["city"]}">{e["city"].upper()}</span>{'<span class="pill">官网精选</span>' if e["featured"] else ""}<span class="status {e["status"]}">{status}</span></div><h3><a href="{escape_html(e["url"])}" target="_blank" rel="noopener noreferrer">{escape_html(e["name"])}</a></h3><p class="event-summary">{escape_html(e["brief"])}</p><div class="event-host">{escape_html(" / ".join(e["hosts"]))}</div><div class="event-host">{escape_html(e["place"])}</div>{('<p class="event-note">' + escape_html(e["note"]) + "</p>") if e["note"] else ""}<div class="event-bottom"><span class="match-note">{escape_html(match)}</span><span class="source-links">{('<a href="' + escape_html(e["lumaUrl"]) + '" target="_blank" rel="noopener noreferrer">Luma ↗</a>') if e.get("lumaUrl") else ""}<a href="{escape_html(e["url"])}" target="_blank" rel="noopener noreferrer">官网 ↗</a></span></div></article>'''

        def options(vals, empty):
            return (
                '<option value="">'
                + empty
                + "</option>"
                + "".join(
                    '<option value="' + escape_html(v) + '">' + escape_html(v) + "</option>"
                    for v in vals
                )
            )

        def listing(es, t=None, wishlist=False):
            formats = sorted({v for e in es for v in e["formats"]})
            dates = [f"2026-10-{i:02}" for i in range(5, 19)]
            related = [
                x
                for x in SORTED_TOPICS
                if not t or (x["group"] == t["group"] and x["slug"] != t["slug"])
            ][:8]
            purpose_filter = (
                ""
                if t
                else '<div class="filter"><label for="filter-purpose">活动侧重</label><select id="filter-purpose"><option value="">所有侧重</option><option value="fundraising">融资与投资</option><option value="pitch">路演与 Demo</option><option value="investor-networking">投资人交流</option></select></div>'
            )
            sidebar = "".join(
                '<a class="related-link" href="/topics/'
                + x["slug"]
                + '/"><span>'
                + escape_html(x["name"])
                + "</span>↗</a>"
                for x in related
            )
            return render_template(
                "listing.html",
                city_tabs_html=Markup(city_tabs()),
                search_html=Markup(search("event-search", "搜索活动、主办方、地点")),
                purpose_filter_html=Markup(purpose_filter),
                date_options_html=Markup(options(dates, "所有日期")),
                format_options_html=Markup(options(formats, "所有形式")),
                event_count=format(len(es), ","),
                event_cards_html=Markup(
                    "".join((event_card(e) for e in es[:12])) if not wishlist else ""
                ),
                load_more_hidden="hidden" if len(es) <= 12 else "",
                snapshot_date=SNAPSHOT["date"],
                review_html=Markup(review_section() if t and t["slug"] == "agent-harness" else ""),
                sidebar_html=Markup(sidebar),
            )

        for i, t in enumerate(TOPICS):
            c = COUNTS[t["slug"]]
            es = sorted(
                [normalize(e, m) for e, m in MATCHES[t["slug"]]],
                key=lambda e: (e["date"], e["time"], e["name"]),
            )
            notice = ""
            source = (
                f'<a class="source" href="{t["source"][1]}" target="_blank" rel="noopener noreferrer">概念延伸 · {escape_html(t["source"][0])} ↗</a>'
                if t["source"]
                else ""
            )
            if t["slug"] == "agent-harness":
                source += '<br><a class="source" href="#system-one-review">决策模型补充线索与核对记录 ↓</a>'
            if t["slug"] in ["ai-companions", "personal-assistants"]:
                notice = (
                    '<p class="notice">'
                    + (
                        "AI 陪伴按角色、情感关系与互动叙事归类；执行个人任务的产品归入个人助理。"
                        if t["slug"] == "ai-companions"
                        else "个人助理按替用户办事与执行任务归类；角色扮演与情感关系产品归入 AI 陪伴。"
                    )
                    + " 这两个专题按已阅读的活动全文逐场归类。上方产品名称用于说明分类，具体参与方见下方活动。</p>"
                )
            topic_name = (
                '<span class="title-phrase">记忆、上下文</span><span class="title-phrase">与知识库</span>'
                if t["slug"] == "agent-memory"
                else escape_html(t["name"])
            )
            body = f"""<div class="crumb"><a href="/">全部专题</a><span>/</span><span>{escape_html(t["group"])}</span></div><section class="topic-hero topic-summary"><div><div class="eyebrow">FIELD {i + 1:02} / {escape_html(t["en"])}</div><div class="topic-title-row"><h1>{topic_name}</h1><span class="topic-symbol" aria-hidden="true">{SYMBOLS[i]}</span></div><p class="intro">{escape_html(t["description"])}</p><div class="topic-stats"><div><b>{c["total"]}</b><span>相关活动</span></div><div><b>{c["sf"]}</b><span>SAN FRANCISCO</span></div><div><b>{c["la"]}</b><span>LOS ANGELES</span></div></div>{source}</div></section>{notice}{listing(es, t)}"""
            p = OUT / "topics" / t["slug"]
            p.mkdir(parents=True, exist_ok=True)
            (p / "index.html").write_text(
                layout(
                    t["name"] + " 专题",
                    t["description"],
                    body,
                    data={"type": "events", "topic": t["slug"], "events": es},
                    accent=t["color"],
                ),
                encoding="utf-8",
            )
        all_events = [
            normalize(e)
            for e in sorted(EVENTS, key=lambda x: (x["date"], x["startTime"], x["name"]))
        ]
        body = f"""<div class="crumb"><a href="/">首页</a><span>/</span><span>全部活动</span></div><section class="topic-hero"><div><div class="eyebrow">THE FULL CALENDAR</div><h1>全部活动</h1><p class="intro">完整浏览 SF 与 LA 的 {TOTAL:,} 条官方日历记录。可按城市、日期、活动侧重、形式和报名状态筛选。</p></div><div class="reading-box"><strong>SF 10/5–11 · LA 10/12–18</strong><p class="site-caption">所有时间均为 PDT（UTC−7）。先确认申请结果，再安排现场行程。</p></div></section>{listing(all_events)}"""
        (OUT / "events").mkdir(exist_ok=True)
        (OUT / "events/index.html").write_text(
            layout(
                "全部活动",
                f"Tech Week 2026 全部 {TOTAL:,} 条 SF 与 LA 活动记录。",
                body,
                "events",
                {"type": "events", "topic": None, "events": all_events},
            ),
            encoding="utf-8",
        )
        wishlist_body = render_template(
            "wishlist.html", listing_html=Markup(listing(all_events, wishlist=True))
        )
        (OUT / "wishlist").mkdir(exist_ok=True)
        (OUT / "wishlist/index.html").write_text(
            layout(
                "我的 Wishlist",
                "免注册收藏 Tech Week 活动，查看谁想去与公开昵称。",
                wishlist_body,
                "wishlist",
                {"type": "events", "wishlist": True, "events": all_events},
            ),
            encoding="utf-8",
        )
        # The API only accepts current official IDs; removed saved records remain readable.
        starts = {
            e["id"]: int(
                datetime.fromisoformat(e["date"] + "T" + e["startTime"])
                .replace(tzinfo=ZoneInfo("America/Los_Angeles"))
                .timestamp()
                * 1000
            )
            for e in EVENTS
        }
        days = "".join(
            f"<tr><td>{['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i]}</td><td>10/{5 + i} · {sum(e['date'] == f'2026-10-{5 + i:02}' for e in EVENTS)}</td><td>10/{12 + i} · {sum(e['date'] == f'2026-10-{12 + i:02}' for e in EVENTS)}</td></tr>"
            for i in range(7)
        )
        guide = render_template(
            "guide.html",
            demo=DEMO,
            day_rows_html=Markup(days),
            checked_local=SNAPSHOT["checked_local"],
            sf_pages=SNAPSHOT.get("pages", {}).get("sf", 22),
            la_pages=SNAPSHOT.get("pages", {}).get("la", 11),
            total_count=format(TOTAL, ","),
            topic_count=len(TOPICS),
            nonempty_count=format(NONEMPTY, ","),
            empty_count=TOTAL - NONEMPTY,
            full_pages_read=SNAPSHOT.get("full_pages_read", 0),
            luma_summary=REFRESH["luma"]["summary"] if REFRESH else "",
        )
        (OUT / "guide").mkdir(exist_ok=True)
        (OUT / "guide/index.html").write_text(
            layout(
                "参会指南与数据说明",
                "Tech Week 的报名、通勤、活动选择与专题归类说明。",
                guide,
                "guide",
            ),
            encoding="utf-8",
        )

        (OUT / "updates").mkdir(exist_ok=True)
        (OUT / "updates/index.html").write_text(
            layout(
                "本次更新记录",
                "SF 与 LA 活动新增、日程、正文及报名状态变化。",
                render_updates(REFRESH, SNAPSHOT),
                "guide",
            ),
            encoding="utf-8",
        )
        (OUT / "404.html").write_text(
            layout(
                "页面未找到",
                "返回 Tech Week 专题指南。",
                '<article class="article"><div class="eyebrow">404 / OFF THE MAP</div><h1>这条路暂时没有活动。</h1><p>可以回到专题页，继续寻找下一场。</p><a class="text-link" href="/">返回全部专题 →</a></article>',
            ),
            encoding="utf-8",
        )
        (OUT / "downloads").mkdir(exist_ok=True)
        safe_csv_copy(BASE / "Tech_Week_2026_SF_LA_完整清单.csv", OUT / "downloads/events.csv")
        safe_csv_copy(BASE / "website/public/downloads/changes.csv", OUT / "downloads/changes.csv")
        (OUT / "_headers").write_text(
            f"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Cross-Origin-Opener-Policy: same-origin-allow-popups\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data:; font-src 'self'; connect-src 'self' {API_URL if API_URL != '/api' else ''} https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'\n/assets/*\n  Cache-Control: public, max-age=3600\n/downloads/*\n  Cache-Control: public, max-age=3600\n",
            encoding="utf-8",
        )
        (OUT / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
        print(
            "Built",
            len(TOPICS),
            "topic pages + home, events, guide, 404;",
            len(EVENTS),
            "events;",
            len(NOTES),
            "editorial briefs",
        )
        for t in TOPICS:
            print(t["name"], COUNTS[t["slug"]])
        print("Home gzip bytes:", len(gzip.compress((OUT / "index.html").read_bytes())))

        privacy_body = render_template("privacy.html")
        (OUT / "privacy").mkdir(exist_ok=True)
        (OUT / "privacy/index.html").write_text(
            layout(
                "数据与隐私",
                "Tech Week 活动指南的免注册身份、Google 登录与公开信息说明。",
                privacy_body,
                "wishlist",
            ),
            encoding="utf-8",
        )

        build_locales(ASSET_VERSION, OUT)
        (ROOT / "backend/event-ids.mjs").write_text(
            "export const EVENT_IDS="
            + json_for_script([e["id"] for e in EVENTS])
            + ";\nexport const EVENT_STARTS="
            + json_for_script(starts)
            + ";\n",
            encoding="utf-8",
        )
        (ROOT / ".local/counts.json").write_text(
            json.dumps(COUNTS, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        _publish(OUT)


if __name__ == "__main__":
    main()

"""Readable change log from the verified snapshot comparison."""

import html


def H(value):
    return html.escape(str(value or ""), quote=True)


FIELDS = {
    "name": "标题",
    "date": "开始日期",
    "startTime": "开始时间",
    "endDate": "结束日期",
    "endTime": "结束时间",
    "hosts": "主办方",
    "neighborhoods": "区域",
    "venue": "地点字段",
    "sponsors": "赞助方",
    "excerpt": "主办方摘要",
    "timeZone": "时区",
    "themes": "官方主题",
    "formats": "活动形式",
    "registration": "报名状态",
    "isFeatured": "官方精选",
    "description": "活动正文",
}
STATUS = {"open": "开放申请", "waitlist": "候补", "full": "已满", "closed": "已关闭"}


def value(v, key):
    if v is None or v == []:
        return "未填写"
    if isinstance(v, list):
        return " / ".join(map(str, v))
    return STATUS.get(v, v) if key == "registration" else str(v)


def item(e, body=""):
    return f'<div class="update-item"><p class="site-caption">{H(e.get("city", e.get("citySlug", "")).upper())} · {H(e.get("date"))}</p><h3><a href="{H(e.get("url") or e.get("eventUrl", "").split("?")[0])}" target="_blank" rel="noopener noreferrer">{H(e["name"])} ↗</a></h3>{body}</div>'


def render_updates(data, snapshot):
    if snapshot.get("demo"):
        return '<article class="article"><h1>更新记录</h1><p>演示模式：以下活动均为虚构示例，不用于报名。</p></article>'
    if not data:
        return '<article class="article"><h1>更新记录</h1><p>正在整理本次更新记录。</p></article>'
    cards = []
    for c in data["changed"]:
        parts = []
        for key, delta in c["changes"].items():
            if key == "description":
                parts.append(
                    "<li>活动正文："
                    + H(c.get("content_summary") or "主办方修改了介绍或议程，已重新读取并核对。")
                    + "</li>"
                )
            else:
                parts.append(
                    f'<li>{FIELDS.get(key, key)}：<span class="old-value">{H(value(delta["before"], key))}</span> → <strong>{H(value(delta["after"], key))}</strong></li>'
                )
        cards.append(item(c, "<ul>" + "".join(parts) + "</ul>"))
    additions = "".join(item(e, "<p>" + H(e.get("brief", "")) + "</p>") for e in data["new"])
    removals = "".join(
        item(e, "<p>本次官方日历未再列出；不等同于主办方确认取消。</p>") for e in data["removed"]
    )
    fields = " · ".join(
        FIELDS.get(k, k) + " " + str(v) + " 场" for k, v in data["field_counts"].items()
    )
    luma = data.get("luma", {})
    media = data.get("media_changes", [])
    media_html = (
        "<details><summary>另有 "
        + str(len(media))
        + " 场更新了封面</summary><ul>"
        + "".join('<li><a href="' + H(e["url"]) + '">' + H(e["name"]) + "</a></li>" for e in media)
        + "</ul></details>"
    )
    leads = luma.get("leads", [])
    lead_html = "".join(
        item(
            e,
            "<p>"
            + H(e["time"])
            + " · "
            + H(e.get("place"))
            + " · "
            + H(STATUS.get(e.get("status"), e.get("status")) or "状态待确认")
            + "</p>"
            + ("<p>" + H(e["brief"]) + "</p>" if e.get("brief") else ""),
        )
        for e in leads
    )
    return f"""<article class="article updates"><div class="eyebrow">CALENDAR UPDATE / {H(snapshot["date"])}</div><h1>本次更新记录</h1><p>核对截至 {H(snapshot["checked_local"])}（PDT），与 {H(data.get("baseline", "此前"))} 网站快照比较。逐页重读 SF、LA 官方日历，并重读全部活动介绍。</p><div class="topic-stats"><div><b>{len(data["new"])}</b><span>新增日历记录</span></div><div><b>{len(data["removed"])}</b><span>移出官方日历</span></div><div><b>{len(data["changed"])}</b><span>已有活动更新</span></div></div><p>{H(fields)}。同一活动可有多项变化，这些数字不可相加。已忽略纯空白、零宽字符及排版字形差异。</p><p>当前共 {data["total"]:,} 条官方记录：SF {data["cities"]["sf"]:,}，LA {data["cities"]["la"]:,}。专题数量按最新记录重新计算，专题内仍按时间排列。</p><p><a href="#new">新增记录 ↓</a> · <a href="#changed">原有活动修改 ↓</a> · <a href="#removed">移出日历 ↓</a> · <a href="#luma">Luma 核对 ↓</a></p><h2 id="new">新增日历记录</h2><p>{H(data.get("new_summary", "新增记录仍须核对活动日期、报名状态和主办方确认结果。"))}</p>{additions}<h2 id="changed">原有活动修改</h2><p>日期和时间均为 PDT。正文变化用中文概括，完整最新介绍可点开活动原文。</p>{"".join(cards)}{media_html}<h2 id="removed">不再列入官方日历</h2>{removals}<h2 id="luma">Luma 核对</h2><p>{H(luma.get("summary", ""))}</p>{"".join("<p>" + H(x) + "</p>" for x in luma.get("findings", []))}<h3>Luma 补充线索 · {len(leads)} 条</h3><p>以下活动在本次检索中标注与 Tech Week 相关，尚未与官方日历记录配对。它们可能包含同场异名记录，也包含此前已找到的线索，因此不计入官方新增数或专题场次。按时间排列，地点与报名条件见 Luma 原文。</p>{lead_html}<p class="site-caption">Luma 搜索每次只返回一页排序结果，不是全站导出；本次覆盖公开关键词结果及此前重点活动。未公开活动和尚未公布的议程无法保证覆盖。报名状态为读取时快照。</p><p><a href="/downloads/changes.csv" download>下载逐项变更清单 CSV ↓</a> · <a href="/downloads/events.csv" download>下载最新全部活动 CSV ↓</a></p></article>"""

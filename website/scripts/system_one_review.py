"""Render the source audit without mixing leads into confirmed event counts."""

import html

from data import content_json

REVIEW = content_json("system_one_review.json")


def H(value):
    return html.escape(str(value), quote=True)


def link(url, label):
    return f'<a href="{H(url)}" target="_blank" rel="noopener noreferrer">{H(label)} ↗</a>'


def review_notice():
    if not REVIEW:
        return ""
    return f"""<p class="notice">{H(REVIEW["conclusion"])} <a class="text-link" href="#system-one-review">查看补充线索与核对记录 ↓</a></p>"""


def review_section():
    if not REVIEW:
        return ""
    cards = []
    for e in REVIEW["leads"]:
        source = (
            '<p class="site-caption">' + link(e["model_source"], "模型资料") + "</p>"
            if e.get("model_source")
            else ""
        )
        cards.append(
            f"""<article class="event-card"><div class="event-meta"><span class="date-label">{H(e["date"][5:].replace("-", "/"))} · {H(e["time"])}</span><span class="pill sf">SF</span><span class="pill">{H(e["kind"])}</span></div><h3>{link(e["url"], e["name"])}</h3><p class="event-summary">{H(e["brief"])}</p><p class="event-note">{H(e["caveat"])}</p>{source}<div class="event-bottom"><span class="match-note">Luma 补充线索 · 未计入已确认场次</span>{link(e["url"], "查看 Luma")}</div></article>"""
        )
    confirmed = "".join(
        "<p>" + link(e["url"], e["name"]) + "：" + H(e["brief"]) + "</p>"
        for e in REVIEW.get("additional_confirmed", [])
    )
    if REVIEW.get("model_source"):
        confirmed += "<p>" + link(REVIEW["model_source"], "XOR 官方模型资料") + "</p>"
    excluded = "".join(
        f"<li>{link(e['url'], e['name'])}：{H(e['reason'])}</li>" for e in REVIEW["excluded"]
    )
    return f"""<section id="system-one-review" class="article"><h2>决策模型：Luma 补充线索</h2><p>{H(REVIEW["conclusion"])}</p><p>以下 {len(cards)} 场在 SF Tech Week 日期内，未出现在本次官方日历快照中。关联依据与待核实之处列在各活动下。</p>{"".join(cards)}<h2>决策模型核对记录</h2><p>{H(REVIEW["coverage"])}</p>{confirmed}<p>{H(REVIEW["luma_coverage"])}</p><p>{link(REVIEW["confirmed_luma_url"], "已确认活动的 Luma 页面")}。{H(REVIEW["alias_note"])}</p><details><summary>线上及其他日期或城市的参考活动</summary><ul>{excluded}</ul></details><p class="site-caption">{H(REVIEW["limitations"])}</p></section>"""

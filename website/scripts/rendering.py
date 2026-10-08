"""Shared escaping and template rendering for static pages and downloads."""

import csv
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

TEMPLATES = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parents[1] / "templates"),
    autoescape=select_autoescape(["html"]),
    undefined=StrictUndefined,
    keep_trailing_newline=True,
)


def render_template(name, **context):
    """Plain data is escaped; only explicitly marked internal HTML bypasses escaping."""
    return TEMPLATES.get_template(name).render(**context)


def json_for_script(value):
    """Serialize JSON safely inside an HTML script element."""
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def csv_safe(value):
    """Prevent imported organizer text from becoming a spreadsheet formula."""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
        return "'" + value
    return value


def safe_csv_copy(source, destination):
    """Sanitize formula prefixes in both original and translated downloads."""
    with (
        source.open(encoding="utf-8-sig", newline="") as input_file,
        destination.open("w", encoding="utf-8-sig", newline="") as output_file,
    ):
        csv.writer(output_file).writerows(
            [[csv_safe(value) for value in row] for row in csv.reader(input_file)]
        )

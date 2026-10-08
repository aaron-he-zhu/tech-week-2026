"""Deployment-specific URLs; a new checkout defaults to the local preview."""

import os
import re
from urllib.parse import urlsplit


def origin(value):
    parsed = urlsplit(value)
    if parsed.port is not None and not 1 <= parsed.port <= 65535:
        raise ValueError("Invalid origin port")
    if parsed.hostname and not re.fullmatch(r"[a-zA-Z0-9.-]+|::1", parsed.hostname):
        raise ValueError("Invalid origin hostname")
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
        or any(character.isspace() for character in value)
        or (parsed.scheme != "https" and not (local and parsed.scheme == "http"))
    ):
        raise ValueError("Expected an HTTPS origin, or HTTP on localhost")
    return value.rstrip("/")


SITE_URL = origin(os.environ.get("SITE_URL") or "http://127.0.0.1:4173")
API_URL = os.environ.get("API_URL") or "/api"
if API_URL != "/api":
    API_URL = origin(API_URL)

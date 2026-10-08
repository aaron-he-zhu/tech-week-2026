"""Read-only smoke checks after deploying the API and website."""

import json
import subprocess
import time
from pathlib import Path

from data import EVENTS
from settings import API_URL, SITE_URL

SITE = SITE_URL
API = SITE_URL + API_URL if API_URL.startswith("/") else API_URL


def fetch(url):
    result = subprocess.run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "30",
            "--header",
            "Cache-Control: no-cache",
            "--header",
            "Origin: " + SITE,
            url,
        ],
        capture_output=True,
        check=True,
    )
    return result.stdout


for attempt in range(3):
    try:
        expected = (Path(__file__).resolve().parents[1] / "dist/index.html").read_bytes()
        assert fetch(SITE + "/") == expected, "Homepage does not match this build"
        chinese = (Path(__file__).resolve().parents[1] / "dist/zh/index.html").read_bytes()
        assert fetch(SITE + "/zh/") == chinese, "Chinese homepage does not match this build"
        stats = json.loads(fetch(API + "/v1/community/stats"))
        assert set(stats) == {"addressCount", "addressEventCount", "computedAt"}
        assert isinstance(stats["addressCount"], int) and stats["addressCount"] >= 0
        assert isinstance(stats["addressEventCount"], int)
        assert 0 <= stats["addressEventCount"] <= stats["addressCount"]
        assert "counts" in json.loads(fetch(API + "/v1/counts"))
        index = json.loads(fetch(API + "/v1/community/address-events"))
        assert set(index) == {"events", "computedAt"}
        assert all(isinstance(count, int) and count > 0 for count in index["events"].values())
        event_id = EVENTS[0]["id"]
        community = json.loads(fetch(API + "/v1/events/" + event_id + "/community"))
        assert isinstance(community["transcriptCount"], int) and community["transcriptCount"] >= 0
        assert isinstance(community["transcripts"], list) and community["mine"] is None
        assert "nextTranscripts" in community
        for route in ("/events/", "/zh/events/"):
            page = fetch(SITE + route)
            assert b'id="filter-address"' in page and b'id="calendar-grid"' in page
        print(
            "PASS: both homepages match this commit; live address stats, transcript links and Wishlist API respond."
        )
        break
    except (AssertionError, ValueError, subprocess.CalledProcessError):
        if attempt == 2:
            raise
        time.sleep(10)

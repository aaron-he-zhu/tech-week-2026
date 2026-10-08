import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from home_calendar import calendar_weeks  # noqa: E402


class HomeCalendarTests(unittest.TestCase):
    def test_counts_ongoing_events_on_each_day_without_mixing_cities(self):
        events = [
            {"citySlug": "sf", "date": "2026-10-04", "endDate": "2026-10-06"},
            {"citySlug": "sf", "date": "2026-10-06", "endDate": "2026-10-06"},
            {"citySlug": "la", "date": "2026-10-06", "endDate": "2026-10-12"},
            {"citySlug": "la", "date": "2026-10-18", "endDate": None},
        ]
        sf, la = calendar_weeks(events)
        self.assertEqual([day["count"] for day in sf["days"]], [1, 2, 0, 0, 0, 0, 0])
        self.assertEqual([day["count"] for day in la["days"]], [1, 0, 0, 0, 0, 0, 1])
        self.assertEqual(sf["days"][0]["date"], "2026-10-05")
        self.assertEqual(la["days"][-1]["date"], "2026-10-18")

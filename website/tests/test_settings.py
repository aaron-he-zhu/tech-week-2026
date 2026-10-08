import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from settings import origin  # noqa: E402


class OriginTests(unittest.TestCase):
    def test_https_and_local_preview_origins(self):
        self.assertEqual(origin("https://guide.example/"), "https://guide.example")
        self.assertEqual(origin("http://127.0.0.1:4173"), "http://127.0.0.1:4173")

    def test_credentials_paths_and_header_injection_are_rejected(self):
        for value in [
            "http://public.example",
            "https://user:password@example.com",
            "https://example.com/path",
            "https://example.com?key=value",
            "https://example.com#fragment",
            "https://example.com\nX-Header:value",
            "https://example.com:bad",
            "https://example.com';script-src",
        ]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                origin(value)

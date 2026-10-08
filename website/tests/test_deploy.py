import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE / "scripts"))

import prepare_deploy  # noqa: E402


class DeploymentTests(unittest.TestCase):
    def test_prepares_both_configs_without_mutating_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "backend").mkdir()
            originals = {}
            for relative in ("wrangler.jsonc", "backend/wrangler.jsonc"):
                originals[relative] = (SOURCE / relative).read_text(encoding="utf-8")
                (root / relative).write_text(originals[relative], encoding="utf-8")
            with (
                patch.object(prepare_deploy, "ROOT", root),
                patch.object(prepare_deploy, "SITE_URL", "https://guide.example"),
                patch.object(prepare_deploy, "API_URL", "https://api.example"),
                patch.dict(
                    os.environ,
                    {
                        "CLOUDFLARE_ACCOUNT_ID": "a" * 32,
                        "D1_DATABASE_ID": "12345678-1234-1234-1234-123456789abc",
                        "GOOGLE_CLIENT_ID": "",
                    },
                ),
            ):
                prepare_deploy.prepare()
            api = json.loads((root / ".local/deploy/api.wrangler.json").read_text())
            site = json.loads((root / ".local/deploy/site.wrangler.json").read_text())
            self.assertEqual(api["vars"]["SITE_URL"], "https://guide.example")
            self.assertEqual(api["vars"]["GOOGLE_CLIENT_ID"], "")
            self.assertEqual(api["account_id"], "a" * 32)
            self.assertEqual(
                api["d1_databases"][0]["database_id"], "12345678-1234-1234-1234-123456789abc"
            )
            self.assertEqual(api["main"], str(root / "backend/worker.mjs"))
            self.assertEqual(site["assets"]["directory"], str(root / "dist"))
            for relative, original in originals.items():
                self.assertEqual((root / relative).read_text(encoding="utf-8"), original)

    def test_refuses_unconfigured_deployment(self):
        with patch.dict(os.environ, {"CLOUDFLARE_ACCOUNT_ID": ""}):
            with self.assertRaisesRegex(ValueError, "CLOUDFLARE_ACCOUNT_ID"):
                prepare_deploy.prepare()
        with patch.dict(
            os.environ,
            {
                "CLOUDFLARE_ACCOUNT_ID": "a" * 32,
                "D1_DATABASE_ID": "00000000-0000-0000-0000-000000000000",
            },
        ):
            with self.assertRaisesRegex(ValueError, "D1_DATABASE_ID"):
                prepare_deploy.prepare()
        with (
            patch.dict(
                os.environ,
                {
                    "CLOUDFLARE_ACCOUNT_ID": "a" * 32,
                    "D1_DATABASE_ID": "12345678-1234-1234-1234-123456789abc",
                },
            ),
            patch.object(prepare_deploy, "API_URL", "/api"),
        ):
            with self.assertRaisesRegex(ValueError, "HTTPS"):
                prepare_deploy.prepare()

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from rendering import TEMPLATES, csv_safe, json_for_script, safe_csv_copy  # noqa: E402


class RenderingTests(unittest.TestCase):
    def test_template_data_cannot_become_markup(self):
        template = TEMPLATES.from_string('<p title="{{ text }}">{{ text }}</p>')
        result = template.render(text='<script>"hello"</script>')
        self.assertNotIn("<script>", result)
        self.assertIn("&lt;script&gt;", result)

    def test_json_cannot_close_its_script_element(self):
        value = {"text": "</script><img src=x onerror=alert(1)>&"}
        result = json_for_script(value)
        self.assertNotIn("<", result)
        self.assertEqual(json.loads(result), value)

    def test_csv_escapes_formulas_but_preserves_normal_values(self):
        for value in ["=1+1", "+SUM(A1)", "-1", "@SUM(A1)", "\t=1", "\r=1", "\n=1"]:
            self.assertEqual(csv_safe(value), "'" + value)
        for value in ["Tech Week", "中文", 42, "2026-10-05", "https://example.com"]:
            self.assertEqual(csv_safe(value), value)

    def test_missing_template_values_fail_instead_of_silently_disappearing(self):
        from jinja2 import UndefinedError

        with self.assertRaises(UndefinedError):
            TEMPLATES.from_string("{{ missing }}").render()


class CsvCopyTests(unittest.TestCase):
    def test_source_export_is_sanitized_without_corrupting_csv_structure(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.csv"
            target = Path(directory) / "export.csv"
            rows = [["标题", "备注"], ["=1+1", "Line 1, quoted\nLine 2"], ["+Example", "普通内容"]]
            with source.open("w", encoding="utf-8-sig", newline="") as output:
                csv.writer(output).writerows(rows)
            safe_csv_copy(source, target)
            with target.open(encoding="utf-8-sig", newline="") as output:
                actual = list(csv.reader(output))
            self.assertEqual(actual, [rows[0], ["'=1+1", rows[1][1]], ["'+Example", rows[2][1]]])

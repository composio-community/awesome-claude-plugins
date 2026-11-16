"""Runs launch_qa.py for real against the two fixture sites.

    python3 -m unittest discover -s tests -v      (from the skill folder)

The defective fixture carries exactly four deliberate defects: an element wider
than the phone viewport, an <img> without alt, an uncaught script error and a
link to a page that does not exist. It must FAIL on exactly those four checks.
The clean fixture must PASS every check. Requires Playwright + Chromium; the
tests are skipped (and say so) when Playwright is missing.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "launch_qa.py")
FIXTURES = os.path.join(HERE, "fixtures")

try:
    import playwright  # noqa: F401
    HAVE_PLAYWRIGHT = True
except ImportError:
    HAVE_PLAYWRIGHT = False

EXPECTED_DEFECTS = {"horizontal-overflow", "img-alt", "console-errors", "internal-links"}


def run_fixture(name):
    out = tempfile.mkdtemp(prefix="launch-qa-test-%s-" % name)
    proc = subprocess.run(
        [sys.executable, SCRIPT, os.path.join(FIXTURES, name), "--out", out],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=300,
    )
    report_path = os.path.join(out, "report.json")
    report = None
    if os.path.exists(report_path):
        with open(report_path) as fh:
            report = json.load(fh)
    return proc, report, out


@unittest.skipUnless(HAVE_PLAYWRIGHT, "Playwright not installed: these tests did NOT run")
class LaunchQAFixtures(unittest.TestCase):

    def test_defective_fails_on_exactly_the_planted_defects(self):
        proc, report, out = run_fixture("defective")
        self.assertIsNotNone(report, proc.stderr)
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        statuses = {c["id"]: c["status"] for c in report["checks"]}
        failed = {cid for cid, st in statuses.items() if st == "FAIL"}
        self.assertEqual(failed, EXPECTED_DEFECTS, statuses)
        others = {cid: st for cid, st in statuses.items() if cid not in EXPECTED_DEFECTS}
        self.assertTrue(all(st == "PASS" for st in others.values()), others)
        details = {c["id"]: " ".join(c["details"]) for c in report["checks"]}
        self.assertIn("pricing.html", details["internal-links"])
        self.assertIn("initCarousel", details["console-errors"])
        self.assertIn("table.svg", details["img-alt"])
        self.assertIn("mobile 390x844", details["horizontal-overflow"])
        for shot in ("mobile-390x844.png", "tablet-768x1024.png", "desktop-1440x900.png"):
            self.assertTrue(os.path.getsize(os.path.join(out, "screenshots", shot)) > 1000, shot)

    def test_clean_passes_every_check(self):
        proc, report, out = run_fixture("clean")
        self.assertIsNotNone(report, proc.stderr)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        statuses = {c["id"]: c["status"] for c in report["checks"]}
        self.assertTrue(all(st == "PASS" for st in statuses.values()), statuses)
        self.assertEqual(report["verdict"], "PASS")
        self.assertTrue(os.path.exists(os.path.join(out, "report.md")))


if __name__ == "__main__":
    unittest.main()

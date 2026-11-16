"""python3 -m unittest discover -s skills/concrete-copy/tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import copy_lint  # noqa: E402

BAD = """<html><head><title>Elevate Your Smile Journey</title>
<meta name="description" content="We leverage cutting-edge tools."></head><body>
<h1>Unlock Seamless Digital Experiences Today</h1>
<p>Not just a gym, it's a lifestyle — whether you're new or experienced!</p>
<a href="/x">Learn more</a><p>Lorem ipsum dolor sit amet.</p>
<script>var seamless = 1;</script><div hidden>leverage hidden text</div></body></html>"""

GOOD = """<html><head><title>Osteria Lume, Bergamo</title>
<meta name="description" content="Fresh pasta every morning. Open 12:00-14:30 and 19:00-22:30."></head><body>
<h1>Fresh pasta every morning</h1><p>40 covers. Kitchen open 12:00-14:30, 19:00-22:30.</p>
<a href="/book">Book a table</a><p>Free cancellation until 24 hours before.</p></body></html>"""


class CopyLintTests(unittest.TestCase):
    def test_bad_page_fails_on_each_tell(self):
        fails, warns, _ = copy_lint.lint(BAD)
        text = "\n".join(fails)
        for needle in ["'elevate'", "'leverage'", "'cutting-edge'", "'unlock'", "'seamless'", "not just",
                       "whether you", "em dash", "placeholder"]:
            self.assertIn(needle, text, needle)
        self.assertTrue(any("vague button" in w for w in warns))
        self.assertTrue(any("exclamation" in w for w in warns))

    def test_harness_noun_ok_verb_flagged(self):
        fails, _, _ = copy_lint.lint("<p>Run the test harness before launch.</p>")
        self.assertEqual(fails, [])
        fails, _, _ = copy_lint.lint("<p>Harness the power of AI.</p>")
        self.assertTrue(any("harness" in f for f in fails), fails)

    def test_hidden_and_script_text_ignored(self):
        fails, _, _ = copy_lint.lint("<p>Open daily.</p><script>leverage()</script><div aria-hidden='true'>seamless</div><div hidden>unlock</div>")
        self.assertEqual(fails, [])

    def test_good_page_passes(self):
        fails, warns, _ = copy_lint.lint(GOOD)
        self.assertEqual(fails, [], fails)
        self.assertEqual(warns, [], warns)


if __name__ == "__main__":
    unittest.main()

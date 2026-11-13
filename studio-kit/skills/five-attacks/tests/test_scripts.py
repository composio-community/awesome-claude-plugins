"""python3 -m unittest discover -s skills/five-attacks/tests"""
import http.server
import json
import os
import random
import string
import subprocess
import sys
import tempfile
import threading
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.dirname(HERE), "scripts")


def fake_key():
    rng = random.Random(3)
    return "sk-" + "proj-" + "".join(rng.choice(string.ascii_letters + string.digits) for _ in range(48))


class Limited(http.server.BaseHTTPRequestHandler):
    hits = 0

    def do_POST(self):
        Limited.hits += 1
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if self.headers.get("Origin") == "https://evil.example":
            code = 403
        else:
            code = 200 if Limited.hits <= 5 else 429
        self.send_response(code)
        self.end_headers()

    def log_message(self, *a):
        pass


class ScanBundleTests(unittest.TestCase):
    def run_scan(self, target):
        return subprocess.run([sys.executable, os.path.join(SCRIPTS, "scan_bundle.py"), target],
                              capture_output=True, text=True, timeout=30)

    def test_dirty_and_clean_dirs(self):
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, "assets"))
        with open(os.path.join(d, "assets", "index-abc.js"), "w") as fh:
            fh.write('const c={apiKey:"%s"};fetch("/x")' % fake_key())
        with open(os.path.join(d, "index.html"), "w") as fh:
            fh.write("<script src='/assets/index-abc.js'></script>")
        p = self.run_scan(d)
        self.assertEqual(p.returncode, 1, p.stdout)
        self.assertIn("OpenAI API key", p.stdout)
        self.assertNotIn(fake_key(), p.stdout)
        os.remove(os.path.join(d, "assets", "index-abc.js"))
        p = self.run_scan(d)
        self.assertEqual(p.returncode, 0, p.stdout)

    def test_url_mode_follows_scripts(self):
        d = tempfile.mkdtemp()
        with open(os.path.join(d, "index.html"), "w") as fh:
            fh.write("<html><script type=module src='/app.js'></script></html>")
        with open(os.path.join(d, "app.js"), "w") as fh:
            fh.write('import "./chunk.js";')
        with open(os.path.join(d, "chunk.js"), "w") as fh:
            fh.write('var k="%s";' % fake_key())
        handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=d, **k)
        http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            p = self.run_scan("http://127.0.0.1:%d/" % srv.server_address[1])
        finally:
            srv.shutdown()
        self.assertEqual(p.returncode, 1, p.stdout + p.stderr)
        self.assertIn("chunk.js", p.stdout)


class ProbeTests(unittest.TestCase):
    def test_rate_limit_and_origin(self):
        Limited.hits = 0
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Limited)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = "http://127.0.0.1:%d/api/chat" % srv.server_address[1]
        try:
            p = subprocess.run([sys.executable, os.path.join(SCRIPTS, "probe_endpoint.py"), url,
                                "--json", json.dumps({"m": "hi"}), "-n", "25", "--delay", "0"],
                               capture_output=True, text=True, timeout=60)
            self.assertIn("first 429 at request: 6", p.stdout, p.stdout)
            self.assertIn("429 x3", p.stdout)
            p = subprocess.run([sys.executable, os.path.join(SCRIPTS, "probe_endpoint.py"), url,
                                "--json", "{}", "-n", "3", "--delay", "0", "--origin", "https://evil.example"],
                               capture_output=True, text=True, timeout=60)
            self.assertIn("403 x3", p.stdout, p.stdout)
        finally:
            srv.shutdown()


if __name__ == "__main__":
    unittest.main()

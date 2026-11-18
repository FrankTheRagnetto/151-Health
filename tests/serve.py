#!/usr/bin/env python3
"""serve.py — the static server of the tests (tests/run.mjs starts it).

    python3 tests/serve.py <port> <repo root> <fixtures dir>

Serves the repo root like `python3 -m http.server`, except two paths that
come from the synthetic fixtures (tests/make-fixtures.mjs), so the app
finds a "bundled" plan without one ever living in www/:
    /www/plan.json  ->  <fixtures>/plan.json
    /www/img/<f>    ->  <fixtures>/img/<f>
"""
import functools, http.server, os, posixpath, sys, urllib.parse

PORT, ROOT, FIX = int(sys.argv[1]), os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = posixpath.normpath(urllib.parse.unquote(path.split('?', 1)[0].split('#', 1)[0]))
        if p == '/www/plan.json':
            return os.path.join(FIX, 'plan.json')
        if p.startswith('/www/img/'):
            name = os.path.basename(p)
            return os.path.join(FIX, 'img', name)
        return super().translate_path(path)

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=ROOT)).serve_forever()

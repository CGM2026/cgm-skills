#!/usr/bin/env python3
"""Serve only a generated chart directory on loopback; Ctrl+C stops it."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--port', type=int, default=0)
args = parser.parse_args()
directory = args.directory.resolve()
if not (directory / 'chart.html').is_file():
    parser.error('directory must contain chart.html')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        request = urlsplit(self.path).path
        choices = {'/': ('chart.html', 'text/html; charset=utf-8'), '/chart.html': ('chart.html', 'text/html; charset=utf-8'),
                   '/chart.svg': ('chart.svg', 'image/svg+xml'), '/chart.png': ('chart.png', 'image/png')}
        if request not in choices:
            self.send_error(404)
            return
        name, mime = choices[request]
        target = (directory / name).resolve()
        if target.parent != directory or not target.is_file():
            self.send_error(404)
            return
        data = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
print(json.dumps({'url': f'http://127.0.0.1:{server.server_port}/chart.html'}), flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()

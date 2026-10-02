"""Serve the working chart and its two bundled fonts on loopback."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--port', type=int, default=0)
args = parser.parse_args()
directory = args.directory.resolve()
assert (directory / 'chart.html').is_file()

files = {
    '/': ('chart.html', 'text/html; charset=utf-8'),
    '/chart.html': ('chart.html', 'text/html; charset=utf-8'),
    '/assets/chaohua-a.ttf': ('assets/chaohua-a.ttf', 'font/ttf'),
    '/assets/huiwen-mincho.ttf': ('assets/huiwen-mincho.ttf', 'font/ttf'),
}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        entry = files.get(urlsplit(self.path).path)
        if not entry:
            self.send_error(404)
            return
        name, mime = entry
        target = (directory / name).resolve()
        if not target.is_relative_to(directory) or not target.is_file():
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

#!/usr/bin/env python3
"""Static preview server for the site, with HTTP Range support.

python -m http.server answers every request with 200 and the whole file, so a
<video> cannot seek and has to download the lot before it plays. Anything
serving the finished site (R2, a CDN) does support Range, so previewing without
it gives a misleading picture.

    python3 tools/serve.py [port]
"""
import http.server, os, re, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        rng = self.headers.get('Range')
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()

        m = re.match(r'bytes=(\d*)-(\d*)$', rng.strip())
        if not m:
            return super().send_head()

        size = os.path.getsize(path)
        first, last = m.group(1), m.group(2)
        if first == '':                      # suffix range: last N bytes
            length = min(int(last or 0), size)
            start, end = size - length, size - 1
        else:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1

        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None

        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        # hand back a reader bounded to the requested slice
        return _Slice(f, end - start + 1)

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


class _Slice:
    """File wrapper that stops after n bytes, for copyfile()."""
    def __init__(self, fh, n):
        self.fh, self.left = fh, n

    def read(self, size=-1):
        if self.left <= 0:
            return b''
        if size < 0 or size > self.left:
            size = self.left
        data = self.fh.read(size)
        self.left -= len(data)
        return data

    def close(self):
        self.fh.close()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), RangeHandler) as httpd:
        print(f'serving {os.getcwd()} at http://127.0.0.1:{PORT}  (Range supported)')
        httpd.serve_forever()

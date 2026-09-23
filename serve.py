# Local dev server for Ace Wing: py serve.py  ->  http://localhost:8777
import http.server, functools, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary'}
os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1', 8777), H).serve_forever()

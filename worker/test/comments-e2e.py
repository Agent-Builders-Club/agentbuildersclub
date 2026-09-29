"""Synthetic Wrangler HTTP+D1 acceptance. Failure modes: auth bypass, CORS/cache leak,
missing ID, muted join, wrong projection/order/cap, injection, write route, DB detail leak.
No remote operations or real rows; artifact is ignored and repeatable.
"""
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artifacts'
DB = ART / 'comments-fresh'
CLI = ROOT / 'node_modules/.bin/wrangler'
TOKEN = secrets.token_urlsafe(32)


def run(*args):
    p = subprocess.run([str(CLI), *args], cwd=ROOT, text=True, capture_output=True,
                       timeout=120, env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
    if p.returncode:
        raise AssertionError(f'{args}: {p.stdout} {p.stderr}'.replace(TOKEN, '[REDACTED]'))
    return p.stdout


def main():
    ART.mkdir(exist_ok=True)
    artifact = ART / 'comments-e2e.json'
    artifact.unlink(missing_ok=True)
    shutil.rmtree(DB, ignore_errors=True)
    checks = []

    def check(ok, label):
        assert ok, label
        checks.append(label)

    args = ('--local', '--persist-to', str(DB))
    run('d1', 'migrations', 'apply', 'DB', *args)
    check('No migrations to apply' in run('d1', 'migrations', 'list', 'DB', *args), 'fresh migration chain applied')
    fixture = ART / 'comments-fixture.sql'
    fixture.write_text("""INSERT INTO agents(id,name,website,photo_url,owner,muted,created_at) VALUES
('a','Alpha','','','Owner A',0,'2026-01-01T00:00:00.000Z'),
('m','Muted','','','Owner M',1,'2026-01-01T00:00:00.000Z');
INSERT INTO posts(id,agent_id,content,created_at) VALUES
('p','a','Post','2026-01-01T00:00:00.000Z'),
('other','a','Other','2026-01-01T00:00:00.000Z');
INSERT INTO comments(id,post_id,agent_id,content,created_at) VALUES
('muted','p','m','Hidden','2026-01-01T01:00:00.000Z'),
('old','p','a','First','2026-01-01T02:00:00.000Z'),
('other','other','a','Separate','2026-01-01T02:00:00.000Z');
""" + ''.join(f"INSERT INTO comments(id,post_id,agent_id,content,created_at) VALUES ('c{i:03d}','p','a','Synthetic','2026-01-02T00:{i//60:02d}:{i%60:02d}.000Z');\n" for i in range(101)))
    try:
        run('d1', 'execute', 'DB', *args, '--file', str(fixture))
    finally:
        fixture.unlink(missing_ok=True)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    varsfile = ROOT / '.dev.vars'
    if varsfile.exists():
        raise RuntimeError('Refusing to overwrite existing .dev.vars')
    varsfile.write_text('INTERNAL_API_TOKEN=' + TOKEN + '\n')
    server = None
    def request(path, token: str | None = TOKEN, method='GET'):
        headers = {'Authorization': 'Bearer ' + token} if token is not None else {}
        req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as res:
                return res.status, dict(res.headers), json.loads(res.read())
        except urllib.error.HTTPError as err:
            return err.code, dict(err.headers), json.loads(err.read())
    try:
        server = subprocess.Popen([str(CLI), 'dev', '--local', '--ip', '127.0.0.1', '--port', str(port), '--persist-to', str(DB)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
        for _ in range(80):
            if server.poll() is not None:
                raise RuntimeError('Wrangler exited')
            try:
                status, _, body = request('/v1/feed')
                if status == 200 and isinstance(body, list) and [r['id'] for r in body] == ['p', 'other']:
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(.25)
        else:
            raise RuntimeError('Fixture feed not ready')
        for path in ('/v1/comments?post_id=p', '/v1/comments', '/v1/comments?post_id='):
            status, headers, body = request(path, None)
            check((status, body) == (401, {'error': 'Unauthorized'}), 'auth before query ' + path)
            check(headers.get('Cache-Control') == 'private, no-store' and 'Access-Control-Allow-Origin' not in headers, 'private unauthorized headers ' + path)
        status, headers, body = request('/v1/comments?post_id=p')
        expected = {'id': 'old', 'post_id': 'p', 'content': 'First', 'created_at': '2026-01-01T02:00:00.000Z', 'agent': {'id': 'a', 'name': 'Alpha', 'website': '', 'photo_url': '', 'owner': 'Owner A'}}
        check(status == 200 and len(body) == 100 and body[0] == expected and body[-1]['id'] == 'c098' and
              all(set(r) == set(expected) and set(r['agent']) == set(expected['agent']) and
                  r['post_id'] == 'p' and r['agent'] == expected['agent'] for r in body) and
              [r['created_at'] for r in body] == sorted(r['created_at'] for r in body) and
              'muted' not in [r['id'] for r in body], 'ordered exact projection, muted exclusion and 100 cap')
        check(headers.get('Cache-Control') == 'private, no-store' and 'Access-Control-Allow-Origin' not in headers and headers.get('X-Content-Type-Options') == 'nosniff', 'private successful headers')
        for path in ('/v1/comments', '/v1/comments?post_id='):
            status, headers, body = request(path)
            check((status, body) == (400, {'error': 'post_id is required'}) and headers.get('Cache-Control') == 'private, no-store', 'missing or empty post ID ' + path)
        check(request('/v1/comments?post_id=unknown')[::2] == (200, []), 'unknown ID empty array')
        injection = urllib.parse.quote("p' OR 1=1 --", safe='')
        check(request('/v1/comments?post_id=' + injection)[::2] == (200, []), 'bound ID rejects SQL injection')
        for method in ('POST', 'OPTIONS', 'PUT'):
            check(request('/v1/comments?post_id=p', method=method)[::2] == (405, {'error': 'Method not allowed'}), 'read-only method ' + method)
        check(request('/v1/comments?post_id=p', token=None, method='POST')[::2] == (401, {'error': 'Unauthorized'}), 'auth before method')
        check(request('/v1/comments/write')[::2] == (404, {'error': 'Not found'}), 'no write route')
        run('d1', 'execute', 'DB', *args, '--command', 'DROP TABLE comments')
        status, headers, body = request('/v1/comments?post_id=p')
        check((status, body) == (500, {'error': 'Internal server error'}) and headers.get('Cache-Control') == 'private, no-store' and 'Access-Control-Allow-Origin' not in headers, 'generic DB failure')
        artifact.write_text(json.dumps({'checks': checks, 'runtime': 'wrangler dev --local + d1 execute --local', 'fixture': 'synthetic', 'remote_operations': False}, indent=2) + '\n')
        print(f'PASS {len(checks)} comments HTTP+D1 checks; {artifact}')
    finally:
        if server is not None:
            server.terminate()
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
        varsfile.unlink(missing_ok=True)


if __name__ == '__main__':
    main()

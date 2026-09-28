"""Only acceptance test: fresh Wrangler local D1 and loopback HTTP, synthetic rows only."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WRANGLER = ROOT / 'node_modules/.bin/wrangler'
ARTIFACT = ROOT / 'artifacts' / 'e2e.json'
PERSIST = ROOT / 'artifacts' / 'd1-fresh'
PORT = 18769
TOKEN = secrets.token_urlsafe(32)


def run(*args):
    p = subprocess.run([str(WRANGLER), *args], cwd=ROOT, text=True, capture_output=True, timeout=90, env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
    if p.returncode:
        raise AssertionError(f'{args}: {p.stdout} {p.stderr}'.replace(TOKEN, '[REDACTED]'))
    return p.stdout


def request(path='/v1/feed', token=None, method='GET', headers=None):
    h = dict(headers or {})
    if token is not None:
        h['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}{path}', headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, dict(r.headers), json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read())


def check(ok, name, checks):
    if not ok:
        raise AssertionError(name)
    checks.append(name)


def main():
    import shutil
    shutil.rmtree(PERSIST, ignore_errors=True)
    PERSIST.mkdir(parents=True)
    args = ['--local', '--persist-to', str(PERSIST)]
    applied = run('d1', 'migrations', 'apply', 'DB', *args)
    pending = run('d1', 'migrations', 'list', 'DB', *args)
    check('No migrations to apply' in pending or 'No migrations found' in pending, 'no pending migrations', [])
    fixtures = ROOT / 'test' / 'fixture.sql'
    run('d1', 'execute', 'DB', *args, '--file', str(fixtures))
    checks = []
    check('0001_feed.sql' in applied, 'migration applied', checks)
    # D1 CLI fails on FK/unique/check violations: verify actual engine constraints.
    for query in [
        "INSERT INTO posts (id,agent_id,content,created_at) VALUES ('bad','missing','x','2026-01-01T00:00:00.000Z')",
        "INSERT INTO agents (id,name,owner,website,photo_url,skills,muted,created_at) VALUES ('duplicate-name','ALPHA','x','','','[]',0,'2026-01-01T00:00:00.000Z')",
        "INSERT INTO agents (id,name,owner,website,photo_url,skills,muted,created_at) VALUES ('bad','x','x','','','not json',0,'2026-01-01T00:00:00.000Z')",
        "INSERT INTO agents (id,name,owner,website,photo_url,skills,muted,created_at) VALUES ('bad','x','x','','','[]',2,'2026-01-01T00:00:00.000Z')",
    ]:
        p = subprocess.run([str(WRANGLER),'d1','execute','DB',*args,'--command',query], cwd=ROOT, capture_output=True, text=True)
        check(p.returncode != 0, 'constraint rejects invalid row ' + str(len(checks)), checks)
    varsfile = ROOT / '.dev.vars'
    if varsfile.exists():
        raise RuntimeError('Existing .dev.vars must not be overwritten')
    varsfile.write_text('INTERNAL_API_TOKEN=' + TOKEN + '\n')
    server = None
    try:
        server = subprocess.Popen([str(WRANGLER),'dev','--local','--ip','127.0.0.1','--port',str(PORT),'--persist-to',str(PERSIST)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env={**os.environ, 'WRANGLER_SEND_METRICS':'false'})
        for _ in range(60):
            try:
                request()
                break
            except (urllib.error.URLError, TimeoutError):
                if server.poll() is not None:
                    raise RuntimeError('wrangler dev exited')
                time.sleep(.25)
        else:
            raise RuntimeError('wrangler dev did not start')
        for path in ['/v1/feed', '/v1/feed?offset=99999', '/unknown']:
            status, headers, body = request(path)
            check(status == 401 and body == {'error':'Unauthorized'}, 'uniform unauth ' + path, checks)
            check(headers.get('Cache-Control') == 'private, no-store' and 'Access-Control-Allow-Origin' not in headers, 'private headers', checks)
        for credential in ['wrong', '']:
            status, _, body = request(token=credential)
            check(status == 401 and body == {'error':'Unauthorized'}, 'bad credential', checks)
        status, _, body = request(token=TOKEN, headers={'x-api-key':'agent-key'})
        check(status == 501 and body == {'error':'Authenticated feed unavailable'}, 'agent key fail closed', checks)
        status, headers, body = request(token=TOKEN)
        check(status == 200 and headers.get('Cache-Control') == 'private, no-store', 'authorized private feed', checks)
        check([r['id'] for r in body] == ['z','y','x'], 'order, muted exclusion', checks)
        check(body[0]['agent_post_count'] == 2 and body[0]['agent_capability_tag'] == 'Search, Tools', 'projected stats and skills', checks)
        check(body[0]['parent_agent_name'] == 'Alpha' and body[0]['parent_agent_website'] == 'https://alpha.test', 'parent author', checks)
        check(body[1]['agent_last_active'] == '2026-01-03T00:00:00.000Z', 'last active', checks)
        check(all(r['upvote_count'] == 0 and r['comment_count'] == 0 and r['user_upvoted'] is False for r in body), 'fixture-only counts', checks)
        check(TOKEN not in json.dumps(body) and 'api_key' not in json.dumps(body), 'no secret in response', checks)
        status, _, body = request('/v1/feed?offset=1', TOKEN)
        check(status == 200 and [r['id'] for r in body] == ['y','x'], 'offset', checks)
        for offset in ['-1','10001','1.2','NaN','1e2','', '1&offset=2']:
            status, _, body = request('/v1/feed?offset='+offset, TOKEN)
            check(status == 400 and body == {'error':'Invalid offset'}, 'invalid offset '+offset, checks)
        status, _, body = request('/v1/feed?offset=10000', TOKEN)
        check(status == 200 and body == [], 'empty feed', checks)
        status, _, body = request('/v1/feed', TOKEN, method='POST')
        check(status == 405, 'read-only route', checks)
        status, _, body = request('/unknown', TOKEN)
        check(status == 404, 'unknown route', checks)
        status, _, body = request('/v1/feed', TOKEN, method='OPTIONS')
        check(status == 405, 'no CORS preflight', checks)
        # Force database failure, and assert generic 503/no SQL detail.
        run('d1','execute','DB',*args,'--command','DROP TABLE posts')
        status, _, body = request('/v1/feed', TOKEN)
        check(status == 503 and body == {'error':'Unable to load feed'}, 'generic DB failure', checks)
        ARTIFACT.write_text(json.dumps({'checks':checks,'migration_applied':'0001_feed.sql' in applied,'pending':pending.strip(),'authorized_fixture':{'ids':['z','y','x'],'offset_1':['y','x']},'runtime':'wrangler dev --local + d1 execute --local','secrets':'redacted'}, indent=2)+'\n')
        print(f'PASS {len(checks)} checks; artifact {ARTIFACT}')
    finally:
        if server is not None:
            server.terminate()
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
        varsfile.unlink(missing_ok=True)


if __name__ == '__main__':
    main()

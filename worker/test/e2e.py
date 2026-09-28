"""Only acceptance test: fresh Wrangler local D1 and loopback HTTP, synthetic rows only."""
import json
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WRANGLER = ROOT / 'node_modules/.bin/wrangler'
ARTIFACT = ROOT / 'artifacts' / 'e2e.json'
PERSIST = ROOT / 'artifacts' / 'd1-fresh'
PORT = None
TOKEN = secrets.token_urlsafe(32)


def run(*args):
    p = subprocess.run([str(WRANGLER), *args], cwd=ROOT, text=True, capture_output=True, timeout=90, env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
    if p.returncode:
        raise AssertionError(f'{args}: {p.stdout} {p.stderr}'.replace(TOKEN, '[REDACTED]'))
    return p.stdout


def request(path='/v1/feed', token=None, method='GET', headers=None, data=None):
    h = dict(headers or {})
    if token is not None:
        h['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}{path}', headers=h, method=method, data=data)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, dict(r.headers), json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read())


def rows(sql, args):
    return json.loads(run('d1', 'execute', 'DB', *args, '--command', sql, '--json'))[0]['results']

def rotate(agent='a', old='a'*64, new='b'*64, operation='op-one', token=TOKEN, body=None):
    payload = body if body is not None else {'agent_id': agent, 'expected_digest': old, 'new_digest': new, 'operation_id': operation}
    return request('/v1/local-write/rotate', token, 'POST', {'Content-Type':'application/json'}, json.dumps(payload).encode())

def check(ok, name, checks):
    if not ok:
        raise AssertionError(name)
    checks.append(name)


def main():
    import shutil
    global PORT
    ARTIFACT.unlink(missing_ok=True)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(('127.0.0.1', 0))
        PORT = listener.getsockname()[1]
    shutil.rmtree(PERSIST, ignore_errors=True)
    PERSIST.mkdir(parents=True)
    args = ['--local', '--persist-to', str(PERSIST)]
    applied = run('d1', 'migrations', 'apply', 'DB', *args)
    pending = run('d1', 'migrations', 'list', 'DB', *args)
    check('No migrations to apply' in pending or 'No migrations found' in pending, 'no pending migrations', [])
    fixtures = ROOT / 'test' / 'fixture.sql'
    run('d1', 'execute', 'DB', *args, '--file', str(fixtures))
    checks = []
    check('0001_feed.sql' in applied and '0002_local_key_cas.sql' in applied, 'migrations applied', checks)
    run('d1','execute','DB',*args,'--command',"INSERT INTO local_key_versions (agent_id,digest) VALUES ('a','" + 'a'*64 + "'),('b','" + 'c'*64 + "')")
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
            if server.poll() is not None:
                raise RuntimeError('wrangler dev exited before readiness')
            try:
                status, _, body = request(token=TOKEN)
                if server.poll() is not None:
                    raise RuntimeError('wrangler dev exited while another listener answered')
                if status == 200 and isinstance(body, list) and [row.get('id') for row in body] == ['z', 'y', 'x']:
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(.25)
        else:
            raise RuntimeError('wrangler dev did not start with the expected fixture')
        status, _, body = rotate()
        check(status == 404 and body == {'error':'Not found'}, 'default bundle rejects write with gate disabled', checks)
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
        varsfile.write_text('INTERNAL_API_TOKEN=' + TOKEN + '\nLOCAL_WRITE_CONTRACT=enabled\n')
        server = subprocess.Popen([str(WRANGLER),'dev','--local','--ip','127.0.0.1','--port',str(PORT),'--persist-to',str(PERSIST)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env={**os.environ, 'WRANGLER_SEND_METRICS':'false'})
        for _ in range(60):
            if server.poll() is not None:
                raise RuntimeError('default wrangler dev exited before enabled-gate readiness')
            try:
                status, _, body = request(token=TOKEN)
                if status == 200 and isinstance(body, list) and [row.get('id') for row in body] == ['z', 'y', 'x']:
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(.25)
        else:
            raise RuntimeError('default wrangler dev did not start with enabled gate')
        status, _, body = rotate()
        check(status == 404 and body == {'error':'Not found'}, 'default bundle rejects write even with gate enabled', checks)
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
        server = subprocess.Popen([str(WRANGLER),'dev','--config','wrangler.local.jsonc','--local','--ip','127.0.0.1','--port',str(PORT),'--persist-to',str(PERSIST)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env={**os.environ, 'WRANGLER_SEND_METRICS':'false'})
        for _ in range(60):
            if server.poll() is not None:
                raise RuntimeError('local write-contract wrangler dev exited before readiness')
            try:
                status, _, body = request(token=TOKEN)
                if status == 200 and isinstance(body, list) and [row.get('id') for row in body] == ['z', 'y', 'x']:
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(.25)
        else:
            raise RuntimeError('local write-contract wrangler dev did not start')
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
        # Atomic CAS contract: no raw key or digest leaves this local-only probe.
        status, _, body = rotate(token=None)
        check(status == 401 and body == {'error':'Unauthorized'}, 'write auth before route', checks)
        status, _, body = request('/v1/local-write/rotate', TOKEN)
        check(status == 405, 'write method', checks)
        for payload in [
            {'agent_id':'a','expected_digest':'x','new_digest':'b'*64,'operation_id':'op-x'},
            {'agent_id':'a','expected_digest':'a'*64,'new_digest':'a'*64,'operation_id':'op-x'},
            {'agent_id':'a','expected_digest':'a'*64,'new_digest':'b'*64,'operation_id':'op-x','extra':'x'},
        ]:
            status, _, body = rotate(body=payload)
            check(status == 400 and body == {'error':'Invalid rotation'}, 'invalid rotation', checks)
        status, _, body = request('/v1/local-write/rotate', TOKEN, 'POST', {'Content-Type':'application/json'}, b'{broken')
        check(status == 400 and body == {'error':'Invalid rotation'}, 'malformed JSON', checks)
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda i: rotate(new='bcdef012'[i]*64, operation=f'parallel-{i}'), range(8)))
        check(sorted(r[0] for r in results) == [200] + [409]*7, 'parallel CAS exactly one winner ' + str([r[0] for r in results]), checks)
        check(all('digest' not in json.dumps(r[2]) and TOKEN not in json.dumps(r[2]) for r in results), 'no digest or token in writes', checks)
        winner = next(i for i, r in enumerate(results) if r[0] == 200)
        winning_digest = 'bcdef012'[winner]*64
        state = rows('SELECT digest,version FROM local_key_versions WHERE agent_id = \'a\'', args)
        check(state == [{'digest':winning_digest,'version':1}], 'durable winning digest and version', checks)
        audit = rows('SELECT operation_id,version FROM local_key_audit ORDER BY operation_id', args)
        check(audit == [{'operation_id':f'parallel-{winner}','version':1}], 'one durable audit row', checks)
        status, _, body = rotate(old='a'*64, new='f'*64, operation='retry')
        check(status == 409 and body == {'error':'Rotation conflict'}, 'stale retry conflict', checks)
        status, _, body = rotate(agent='unknown', old='a'*64, new='f'*64, operation='retry')
        check(status == 409 and body == {'error':'Rotation conflict'}, 'unknown identity indistinguishable', checks)
        # Audit uniqueness failure must roll back the key update in the same statement.
        status, _, body = rotate(old=winning_digest, new='f'*64, operation=f'parallel-{winner}')
        check(status == 503 and body == {'error':'Rotation unavailable'}, 'audit collision generic failure', checks)
        check(rows('SELECT digest,version FROM local_key_versions WHERE agent_id = \'a\'', args) == state and rows('SELECT operation_id,version FROM local_key_audit', args) == audit, 'trigger failure rolls back CAS', checks)
        status, _, body = rotate(old=winning_digest, new='f'*64, operation='second')
        check(status == 200 and body == {'version':2}, 'recovery after rollback', checks)
        check(rows('SELECT digest,version FROM local_key_versions WHERE agent_id = \'a\'', args) == [{'digest':'f'*64,'version':2}], 'second durable rotation', checks)
        # Force database failure, and assert generic 503/no SQL detail.
        run('d1','execute','DB',*args,'--command','DROP TABLE posts')
        status, _, body = request('/v1/feed', TOKEN)
        check(status == 503 and body == {'error':'Unable to load feed'}, 'generic DB failure', checks)
        ARTIFACT.write_text(json.dumps({'checks':checks,'migration_applied':['0001_feed.sql','0002_local_key_cas.sql'],'pending':pending.strip(),'authorized_fixture':{'ids':['z','y','x'],'offset_1':['y','x']},'write_contract':{'parallel_winners':1,'parallel_conflicts':7,'audit_rollback':True,'final_version':2},'runtime':'wrangler dev --local + d1 execute --local','secrets':'redacted'}, indent=2)+'\n')
        print(f'PASS {len(checks)} checks; artifact {ARTIFACT}')
    finally:
        if server is not None:
            server.terminate()
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
        varsfile.unlink(missing_ok=True)


if __name__ == '__main__':
    main()

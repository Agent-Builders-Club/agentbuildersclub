"""Real local Wrangler HTTP+D1 public-skills contract; synthetic rows only."""
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / 'node_modules/.bin/wrangler'
ART = ROOT / 'artifacts'
TOKEN = secrets.token_urlsafe(32)


def run(*args, succeeds=True):
    p = subprocess.run([str(CLI), *args], cwd=ROOT, text=True, capture_output=True, timeout=90,
                       env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
    if succeeds and p.returncode:
        raise AssertionError(f'{args}: {p.stdout} {p.stderr}'.replace(TOKEN, '[REDACTED]'))
    if not succeeds and not p.returncode:
        raise AssertionError(f'Unexpected SQL success: {args}')
    return p.stdout


def http(port, path, token: str | None = TOKEN, method='GET', headers=None):
    h = dict(headers or {})
    if token is not None:
        h['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()


def main():
    output = ART / 'skills-e2e.json'
    output.unlink(missing_ok=True)
    checks = []

    def check(value, label):
        if not value:
            raise AssertionError(label)
        checks.append(label)

    legacy = ART / 'skills-legacy'
    fresh = ART / 'skills-fresh'
    old_migrations = ART / 'skills-old-migrations'
    old_config = ART / 'skills-old-config.json'
    for path in (legacy, fresh, old_migrations):
        shutil.rmtree(path, ignore_errors=True)
    old_migrations.mkdir(parents=True)
    for name in ('0001_feed.sql', '0002_local_key_cas.sql', '0003_feed_counts.sql'):
        shutil.copy2(ROOT / 'migrations' / name, old_migrations / name)
    config = json.loads((ROOT / 'wrangler.jsonc').read_text())
    config['d1_databases'][0]['migrations_dir'] = str(old_migrations)
    old_config.write_text(json.dumps(config))
    la = ['--local', '--persist-to', str(legacy)]
    fa = ['--local', '--persist-to', str(fresh)]
    try:
        check('0003_feed_counts.sql' in run('d1', 'migrations', 'apply', 'DB', '--config', str(old_config), *la), 'legacy baseline',)
        run('d1', 'execute', 'DB', *la, '--command', "INSERT INTO agents (id,name,owner,created_at) VALUES ('legacy','Legacy','Owner','2026-01-01T00:00:00.000Z'); INSERT INTO posts (id,agent_id,content,created_at) VALUES ('old','legacy','Old','2026-01-01T00:00:00.000Z')")
        upgrade = run('d1', 'migrations', 'apply', 'DB', *la)
        check('0004_public_skills.sql' in upgrade and '0003_feed_counts.sql' not in upgrade, 'only additive skills migration')
        result = json.loads(run('d1', 'execute', 'DB', *la, '--command', 'SELECT id FROM posts', '--json'))[0]['results']
        check(result == [{'id': 'old'}], 'legacy feed data preserved')
        check('No migrations to apply' in run('d1', 'migrations', 'list', 'DB', *la), 'legacy no pending migrations')
        fresh.mkdir(parents=True)
        applied = run('d1', 'migrations', 'apply', 'DB', *fa)
        check(all(name in applied for name in ('0001_feed.sql', '0002_local_key_cas.sql', '0003_feed_counts.sql', '0004_public_skills.sql')), 'fresh all migrations')
        check('No migrations to apply' in run('d1', 'migrations', 'list', 'DB', *fa), 'fresh no pending migrations')
        run('d1', 'execute', 'DB', *fa, '--file', str(ROOT / 'test' / 'skills-fixture.sql'))
        # Constraints are exercised through the actual D1 CLI, never sqlite3.
        for label, sql in [
            ('invalid array', "UPDATE skills SET trigger_phrases='not json' WHERE id='alpha'"),
            ('non-string array', "UPDATE skills SET trigger_phrases='[1]' WHERE id='alpha'"),
            ('invalid boolean', "UPDATE skills SET flagged=2 WHERE id='alpha'"),
            ('negative installs', "UPDATE skills SET install_count=-1 WHERE id='alpha'"),
            ('null required text', "UPDATE skills SET instructions=NULL WHERE id='alpha'"),
            ('invalid time', "UPDATE skills SET created_at='yesterday' WHERE id='alpha'"),
        ]:
            run('d1', 'execute', 'DB', *fa, '--command', sql, succeeds=False)
            check(True, 'constraint rejects ' + label)
        varsfile = ROOT / '.dev.vars'
        if varsfile.exists():
            raise RuntimeError('Existing .dev.vars must not be overwritten')
        varsfile.write_text('INTERNAL_API_TOKEN=' + TOKEN + '\n')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        server = None
        try:
            server = subprocess.Popen([str(CLI), 'dev', '--local', '--ip', '127.0.0.1', '--port', str(port), '--persist-to', str(fresh)],
                                      cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                      env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
            for _ in range(80):
                if server.poll() is not None:
                    raise RuntimeError('Wrangler exited before readiness')
                try:
                    status, _, body = http(port, '/v1/skills')
                    if status == 200 and isinstance(json.loads(body), list):
                        break
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                    pass
                time.sleep(.25)
            else:
                raise RuntimeError('Wrangler did not serve skills')
            for path in ('/v1/skills', '/v1/skills/alpha/export', '/v1/skills/pending/export', '/v1/skills/unknown/export', '/v1/skills/%27%20OR%201%3D1--/export', '/v1/feed'):
                status, h, body = http(port, path, None)
                check(status == 401 and json.loads(body) == {'error': 'Unauthorized'}, 'auth before route ' + path)
                check(h.get('Cache-Control') == 'private, no-store' and 'Access-Control-Allow-Origin' not in h, 'private unauth headers ' + path)
            check(http(port, '/v1/skills', 'wrong')[0] == 401, 'bad bearer denied')
            status, h, body = http(port, '/v1/skills')
            data = json.loads(body)
            check(status == 200 and [s['id'] for s in data] == ['beta', 'alpha', 'zeta'], 'approved unflagged ordered installs then date')
            check(data[1] == {'id': 'alpha', 'name': 'Unsafe / Name!', 'description': 'Alpha description', 'category': 'Utility', 'trigger_phrases': ['first', 'second'], 'instructions': 'Alpha instructions', 'submitter_name': 'Alice', 'install_count': 4, 'created_at': '2026-01-01T00:00:00.000Z'}, 'list exact projection')
            check(all(set(s) == set(data[1]) for s in data), 'no private fields in list')
            check(h.get('Cache-Control') == 'private, no-store' and h.get('X-Content-Type-Options') == 'nosniff' and 'Access-Control-Allow-Origin' not in h, 'private list headers')
            status, h, body = http(port, '/v1/skills/alpha/export')
            exported = json.loads(body)
            check(status == 200 and h.get('Content-Disposition') == 'attachment; filename="unsafe-name.clawpack"' and h.get('Content-Type') == 'application/json', 'safe clawpack download headers')
            check(set(exported) == {'format', 'version', 'name', 'description', 'instructions', 'trigger_phrases', 'category', 'metadata'} and exported['format'] == 'clawpack-v1' and exported['version'] == '1.0' and exported['name'] == 'Unsafe / Name!' and exported['description'] == 'Alpha description' and exported['instructions'] == 'Alpha instructions' and exported['trigger_phrases'] == ['first', 'second'] and exported['category'] == 'Utility', 'clawpack exact top-level fields')
            check(exported['metadata']['submitted_by'] == 'Alice' and exported['metadata']['source'] == 'agentbuildersclub.dev' and set(exported['metadata']) == {'submitted_by', 'source', 'exported_at'} and exported['metadata']['exported_at'].endswith('Z'), 'clawpack metadata')
            check(body.startswith('{\n  "format": "clawpack-v1"'), 'pretty JSON export')
            for identity in ('pending', 'flagged', 'unknown', '%27%20OR%201%3D1--', '%2Fetc%2Fpasswd', '%ZZ'):
                status, _, body = http(port, '/v1/skills/' + identity + '/export')
                check(status == 404 and json.loads(body) == {'error': 'Skill not found'}, 'indistinguishable unavailable export ' + identity)
            check(http(port, '/v1/skills', TOKEN, 'POST')[0] == 405, 'no skill write route')
            check(http(port, '/v1/skills/alpha/export', TOKEN, 'PATCH')[0] == 405, 'no export write route')
            for path in ('/api/skills', '/v1/skills/submit', '/v1/skills/moderate', '/v1/local-write/rotate'):
                check(http(port, path)[0] == 404, 'no unrelated/public route ' + path)
            check(http(port, '/v1/skills', TOKEN, headers={'x-api-key': 'agent-secret'})[0] == 501, 'agent key unsupported')
            run('d1', 'execute', 'DB', *fa, '--command', 'DROP TABLE skills')
            check(http(port, '/v1/skills')[0] == 500, 'list database failure is 500')
            status, _, body = http(port, '/v1/skills/alpha/export')
            check(status == 404 and json.loads(body) == {'error': 'Skill not found'}, 'export query failure matches Next 404')
        finally:
            if server:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
            varsfile.unlink(missing_ok=True)
        output.write_text(json.dumps({'checks': checks, 'count': len(checks), 'migrations': ['0001', '0002', '0003', '0004'], 'fixture': 'synthetic', 'transport': 'Wrangler local HTTP+D1'}, indent=2) + '\n')
        print(f'{len(checks)} skills E2E checks passed; artifact: {output}')
    finally:
        old_config.unlink(missing_ok=True)
        shutil.rmtree(old_migrations, ignore_errors=True)


if __name__ == '__main__':
    main()

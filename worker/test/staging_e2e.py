"""Local-only staging migration/HTTP acceptance; writes ignored artifacts, never remote D1."""
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
ART = ROOT / 'artifacts'
WRANGLER = ROOT / 'node_modules/.bin/wrangler'
CONFIG = 'wrangler.staging.jsonc'
NAMES = ['0001_feed.sql', '0002_feed_counts.sql', '0003_public_skills.sql']


def cmd(*args, success=True):
    p = subprocess.run([str(WRANGLER), *args], cwd=ROOT, capture_output=True, text=True,
                       timeout=120, env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
    if (p.returncode == 0) != success:
        raise AssertionError(f'{args}: {p.stdout} {p.stderr}')
    return p.stdout + p.stderr


def db(sql, persist):
    return json.loads(cmd('d1', 'execute', 'DB', '--config', CONFIG, '--local', '--persist-to', str(persist),
                          '--command', sql, '--json'))[0]['results']


def main():
    artifact = ART / 'staging-e2e.json'
    artifact.unlink(missing_ok=True)
    checks = []
    def check(value, label):
        assert value, label
        checks.append(label)
    preflight = subprocess.run(['python3', 'test/staging_preflight.py'], cwd=ROOT, capture_output=True, text=True)
    check(preflight.returncode == 0, 'staging preflight: ' + preflight.stderr)
    ART.mkdir(exist_ok=True)
    for label in ('staging-fresh', 'staging-legacy', 'staging-rollback'):
        shutil.rmtree(ART / label, ignore_errors=True)
    fresh = ART / 'staging-fresh'
    args = ('--config', CONFIG, '--local', '--persist-to', str(fresh))
    listing = cmd('d1', 'migrations', 'list', 'DB', *args)
    check(all(name in listing for name in NAMES) and '0002_local_key_cas.sql' not in listing and '0003_feed_counts.sql' not in listing, 'fresh pending list contains staging read chain, no CAS')
    applied = cmd('d1', 'migrations', 'apply', 'DB', *args)
    check(all(name in applied for name in NAMES) and 'local_key' not in applied, 'fresh staging chain applied')
    check('No migrations to apply' in cmd('d1', 'migrations', 'list', 'DB', *args), 'fresh no pending migrations')
    objects = db("SELECT name FROM sqlite_master WHERE type IN ('table','trigger') ORDER BY name", fresh)
    names = {r['name'] for r in objects}
    check({'agents', 'posts', 'comments', 'upvotes', 'skills'}.issubset(names) and not any('local_key' in n for n in names), 'fresh schema has feed and skills but no local key table or trigger')
    legacy = ART / 'staging-legacy'
    legacy_dir = ART / 'staging-legacy-migrations'
    legacy_config = ART / 'staging-legacy-config.json'
    legacy_dir.mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'migrations' / '0001_feed.sql', legacy_dir / '0001_feed.sql')
    config = json.loads((ROOT / CONFIG).read_text())
    config['d1_databases'][0]['migrations_dir'] = str(legacy_dir)
    legacy_config.write_text(json.dumps(config))
    try:
        cmd('d1', 'migrations', 'apply', 'DB', '--config', str(legacy_config), '--local', '--persist-to', str(legacy))
        db("INSERT INTO agents(id,name,owner,created_at) VALUES ('a','Alpha','Owner','2026-01-01T00:00:00.000Z'); INSERT INTO posts(id,agent_id,content,created_at) VALUES ('p','a','Legacy','2026-01-01T00:00:00.000Z')", legacy)
        # The legacy DB already knows 0001; staging 0002 and 0003 follow.
        upgrade = cmd('d1', 'migrations', 'apply', 'DB', '--config', CONFIG, '--local', '--persist-to', str(legacy))
        check('0002_feed_counts.sql' in upgrade and '0003_public_skills.sql' in upgrade and '0001_feed.sql' not in upgrade, 'legacy feed-only DB applies counts and skills')
        check(db('SELECT id FROM posts', legacy) == [{'id': 'p'}] and db('SELECT count(*) AS n FROM comments', legacy) == [{'n': 0}], 'legacy row preserved and counts created')
        check('No migrations to apply' in cmd('d1', 'migrations', 'list', 'DB', '--config', CONFIG, '--local', '--persist-to', str(legacy)), 'legacy no pending migrations')
        # Simulate the already-applied staging feed chain: the next upgrade must be skills alone.
        feed_dir = ART / 'staging-feed-migrations'
        feed_config = ART / 'staging-feed-config.json'
        feed_dir.mkdir(exist_ok=True)
        for name in NAMES[:2]:
            shutil.copy2(ROOT / 'migrations.staging' / name, feed_dir / name)
        config['d1_databases'][0]['migrations_dir'] = str(feed_dir)
        feed_config.write_text(json.dumps(config))
        upgraded = ART / 'staging-feed-upgrade'
        shutil.rmtree(upgraded, ignore_errors=True)
        try:
            cmd('d1', 'migrations', 'apply', 'DB', '--config', str(feed_config), '--local', '--persist-to', str(upgraded))
            db("INSERT INTO agents(id,name,owner,created_at) VALUES ('kept','Keep','Owner','2026-01-01T00:00:00.000Z'); INSERT INTO posts(id,agent_id,content,created_at) VALUES ('kept-post','kept','Pre-upgrade','2026-01-01T00:00:00.000Z')", upgraded)
            only_skills = cmd('d1', 'migrations', 'apply', 'DB', '--config', CONFIG, '--local', '--persist-to', str(upgraded))
            check('0003_public_skills.sql' in only_skills and '0002_feed_counts.sql' not in only_skills and '0001_feed.sql' not in only_skills, 'applied feed chain upgrades with skills alone')
            check(db("SELECT id FROM posts WHERE id='kept-post'", upgraded) == [{'id': 'kept-post'}] and db('SELECT count(*) AS n FROM skills', upgraded) == [{'n': 0}], 'feed row preserved and skills table starts empty')
            check('No migrations to apply' in cmd('d1', 'migrations', 'list', 'DB', '--config', CONFIG, '--local', '--persist-to', str(upgraded)), 'feed upgrade has no pending migrations')
        finally:
            feed_config.unlink(missing_ok=True)
            shutil.rmtree(feed_dir, ignore_errors=True)
    finally:
        legacy_config.unlink(missing_ok=True)
        shutil.rmtree(legacy_dir, ignore_errors=True)
    # A later failed migration must not leave partial DDL or erase earlier feed rows.
    rollback = ART / 'staging-rollback'
    rollback_dir = ART / 'staging-rollback-migrations'
    rollback_config = ART / 'staging-rollback-config.json'
    rollback_dir.mkdir(exist_ok=True)
    for name in NAMES:
        shutil.copy2(ROOT / 'migrations.staging' / name, rollback_dir / name)
    (rollback_dir / '0003_failure.sql').write_text('CREATE TABLE should_rollback (id TEXT);\nINSERT INTO missing_table VALUES (1);\n')
    config['d1_databases'][0]['migrations_dir'] = str(rollback_dir)
    rollback_config.write_text(json.dumps(config))
    try:
        check('missing_table' in cmd('d1', 'migrations', 'apply', 'DB', '--config', str(rollback_config), '--local', '--persist-to', str(rollback), success=False), 'failed third migration rejects invalid SQL')
        check(db("SELECT name FROM sqlite_master WHERE name = 'should_rollback'", rollback) == [], 'failed migration DDL rolled back')
        check({'agents', 'posts', 'comments', 'upvotes'}.issubset({r['name'] for r in db("SELECT name FROM sqlite_master WHERE type='table'", rollback)}), 'earlier successful feed migrations retained')
    finally:
        rollback_config.unlink(missing_ok=True)
        shutil.rmtree(rollback_dir, ignore_errors=True)
    token = secrets.token_urlsafe(32)
    varsfile = ROOT / '.dev.vars'
    if varsfile.exists():
        raise RuntimeError('Existing .dev.vars must not be overwritten')
    cmd('d1', 'execute', 'DB', *args, '--file', str(ROOT / 'test/fixture.sql'))
    cmd('d1', 'execute', 'DB', *args, '--file', str(ROOT / 'test/skills-fixture.sql'))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    varsfile.write_text('INTERNAL_API_TOKEN=' + token + '\nLOCAL_WRITE_CONTRACT=enabled\n')
    server = None
    try:
        server = subprocess.Popen([str(WRANGLER), 'dev', '--config', CONFIG, '--local', '--ip', '127.0.0.1', '--port', str(port), '--persist-to', str(fresh)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env={**os.environ, 'WRANGLER_SEND_METRICS': 'false'})
        def request(path, method='GET', authorized=True):
            req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', method=method, headers={'Authorization': 'Bearer ' + token} if authorized else {})
            try:
                with urllib.request.urlopen(req, timeout=5) as res:
                    return res.status, json.loads(res.read())
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read())
        for _ in range(80):
            if server.poll() is not None:
                raise RuntimeError('staging dev exited')
            try:
                status, feed = request('/v1/feed')
                if status == 200 and [r['id'] for r in feed] == ['z', 'y', 'r', 'x']:
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(.25)
        else:
            raise RuntimeError('staging feed not ready')
        check(feed[0]['upvote_count'] == 2 and feed[0]['comment_count'] == 1, 'staging HTTP feed counts')
        check(request('/v1/feed', authorized=False)[0] == 401, 'staging feed requires bearer')
        check(request('/v1/local-write/rotate', 'POST') == (404, {'error': 'Not found'}), 'staging write route absent even with gate enabled')
        check(request('/v1/skills', authorized=False) == (401, {'error': 'Unauthorized'}), 'staging skills require bearer')
        status, skills = request('/v1/skills')
        check(status == 200 and [s['id'] for s in skills] == ['beta', 'alpha', 'zeta'] and skills[1]['submitter_name'] == 'Alice', 'staging HTTP skills approved unflagged filter and ordering')
        check(request('/v1/skills/alpha/export')[1]['format'] == 'clawpack-v1', 'staging HTTP skills export')
        check(request('/v1/skills/pending/export') == (404, {'error': 'Skill not found'}) and request('/v1/skills/flagged/export') == (404, {'error': 'Skill not found'}), 'staging export excludes pending and flagged')
    finally:
        if server is not None:
            server.terminate()
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
        varsfile.unlink(missing_ok=True)
    artifact.write_text(json.dumps({'checks': checks, 'staging_migrations': NAMES, 'remote_operations': False}, indent=2) + '\n')
    print(f'PASS {len(checks)} staging E2E checks; {artifact}')

if __name__ == '__main__':
    main()

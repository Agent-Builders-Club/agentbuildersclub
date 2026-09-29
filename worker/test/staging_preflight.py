"""Fail-closed staging D1 target/migration check. No writes; --remote-check lists D1 only."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = "52fd7f274b96876a4085c530a53b759c"
DB_ID = "58520610-7890-4fbe-92ac-a5e987148e83"
DB_NAME = "abc-staging-20260929"
CONFIG = "wrangler.staging.jsonc"
HASHES = {
    "src/index.ts": "ea52fab1894df7fc4ffc3f1abfa77aa9398be1f52b29420bff46ce370acd9bf5",
    "wrangler.jsonc": "abed77f8609f446148f7488f56b7aa168ee5161ee62ae273992dc947f5be74bf",
    "wrangler.local.jsonc": "3e9c802dd4a672c24113e1641b6cc94e3f63f9d7eab2f6dd16d579f04c0af6c0",
    "migrations/0001_feed.sql": "99272ee85b75a02e840cc0674d2e672d908397bd776a5daf826ea3947014212e",
    "migrations/0002_local_key_cas.sql": "bbdae68f6484c9c0f5551b5504ecf865ba01c50bc53c250745cd804ca65f5cfd",
    "migrations/0003_feed_counts.sql": "34f8ef89db47bec48a690856b7f645c1759d98f0c2c52dc56b024871c6f84c0d",
}
STAGING_SQL = {
    "0001_feed.sql": ("migrations/0001_feed.sql", HASHES["migrations/0001_feed.sql"]),
    "0002_feed_counts.sql": ("migrations/0003_feed_counts.sql", HASHES["migrations/0003_feed_counts.sql"]),
}
EXPECTED = {
    "$schema": "./node_modules/wrangler/config-schema.json",
    "name": "abc-feed-staging-20260929",
    "main": "src/index.ts",
    "compatibility_date": "2026-09-19",
    "account_id": ACCOUNT,
    "workers_dev": False,
    "preview_urls": False,
    "send_metrics": False,
    "d1_databases": [{"binding": "DB", "database_name": DB_NAME,
                      "database_id": DB_ID, "migrations_dir": "migrations.staging"}],
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_local():
    require(Path.cwd().resolve() == ROOT, "run from worker/ only")
    require(not (ROOT / ".wrangler/deploy/config.json").exists(), "generated Wrangler redirect present")
    require(os.environ.get("CLOUDFLARE_ACCOUNT_ID", ACCOUNT) == ACCOUNT, "account environment mismatch")
    require(json.loads((ROOT / CONFIG).read_text()) == EXPECTED, "staging config differs from reviewed target")
    require({p.name for p in (ROOT / "migrations").iterdir()} ==
            {"0001_feed.sql", "0002_local_key_cas.sql", "0003_feed_counts.sql"}, "local migration set changed")
    staging = ROOT / "migrations.staging"
    require(staging.is_dir() and {p.name for p in staging.iterdir()} == set(STAGING_SQL),
            "staging migration set changed (including non-SQL files)")
    for path, digest in HASHES.items():
        require(hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest,
                f"reviewed file changed: {path}")
    for name, (source, digest) in STAGING_SQL.items():
        candidate = staging / name
        require(candidate.is_file() and not candidate.is_symlink() and
                hashlib.sha256(candidate.read_bytes()).hexdigest() == digest and
                candidate.read_bytes() == (ROOT / source).read_bytes(),
                f"staging SQL differs from reviewed source: {name}")
    require("local-write" not in (ROOT / "src/index.ts").read_text(), "default entrypoint imports local write")
    # Bundle the actual staging config and inspect its output, not just its main path.
    (ROOT / "artifacts").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="staging-preflight-", dir=ROOT / "artifacts") as out:
        subprocess.run([str(ROOT / "node_modules/.bin/wrangler"), "deploy", "--config", CONFIG,
                        "--dry-run", "--outdir", out], cwd=ROOT, check=True,
                       capture_output=True, text=True, timeout=120)
        bundle = "\n".join(p.read_text() for p in Path(out).rglob("*.js"))
        require(bool(bundle) and "/v1/feed" in bundle and
                not any(marker in bundle for marker in ("/v1/local-write/rotate", "local_key_versions", "local_key_audit")),
                "staging bundle contains local-write or lacks feed")
    print("PASS: staging target, account, source-matched feed-only SQL, exact sets and read-only bundle")


def check_remote():
    env = dict(os.environ, CLOUDFLARE_ACCOUNT_ID=ACCOUNT)
    result = subprocess.run([str(ROOT / "node_modules/.bin/wrangler"), "d1", "list",
                             "--json", "--config", CONFIG], cwd=ROOT, env=env,
                            text=True, capture_output=True, timeout=60, check=True)
    databases = json.loads(result.stdout)
    require(isinstance(databases, list), "unexpected D1 list response")
    matches = [db for db in databases if db.get("uuid") == DB_ID or db.get("name") == DB_NAME]
    require(len(matches) == 1 and matches[0].get("uuid") == DB_ID and matches[0].get("name") == DB_NAME,
            "remote D1 name/ID mismatch (or duplicate)")
    print("PASS: read-only remote D1 list matches exact staging name and UUID")


if __name__ == "__main__":
    try:
        require(sys.argv[1:] in ([], ["--remote-check"]), "usage: python3 test/staging_preflight.py [--remote-check]")
        check_local()
        if sys.argv[1:]:
            check_remote()
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print(f"FAIL CLOSED: {exc}", file=sys.stderr)
        sys.exit(1)

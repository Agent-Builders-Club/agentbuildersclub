// Real serving contract: compiled OpenNext by default; explicit Next fallback is NOT Worker acceptance.
// Failure inventory before seam repairs: absent durable IDs, omitted directory/comment pages,
// SSR/metadata/key leaks, UTC/Chicago hydration drift, false outage404, missing skip landmarks.
// Disposable full migrations only; no shipping test endpoint, SMTP or provider credentials.
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--next-boundary")
  ? "compiled-next-local-d1"
  : "compiled-opennext-local-d1";
const label = process.env.ABC_COMPILED_LABEL || "candidate";
assert(/^[a-z0-9-]+$/.test(label));
const out = resolve(
  process.env.ABC_COMPILED_OUTPUT || resolve(root, "artifacts/compiled-d1"),
  label,
);
const scratch = resolve(
  process.env.TMPDIR || root,
  "abc-serving",
  `${label}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
mkdirSync(scratch, { recursive: true });
const report = {
  mode,
  label,
  verdict: "BLOCKED",
  cases: [],
  migrations: [],
  source: {},
  cleanup: {},
};
const save = () =>
  writeFileSync(resolve(out, "results.json"), JSON.stringify(report, null, 2));
save();
function sourceManifest() {
  const list = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(list.status, 0, "Source inventory failed");
  return Object.fromEntries(
    [...new Set(list.stdout.split("\0").filter(Boolean))].sort().map((p) => [
      p,
      createHash("sha256")
        .update(readFileSync(resolve(root, p)))
        .digest("hex"),
    ]),
  );
}
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  TZ: "UTC",
};
const secret = "PRIVATE_SYNTHETIC_DIGEST_DO_NOT_RENDER";
const config = resolve(scratch, "wrangler.json");
const port = 33319;
const base = `http://127.0.0.1:${port}`;
const persist = resolve(scratch, ".wrangler/state");
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
let app, browser;
function cli(args) {
  const r = spawnSync(
    process.execPath,
    [wrangler, ...args, "--config", config],
    { cwd: root, env, encoding: "utf8", timeout: 120000 },
  );
  writeFileSync(
    resolve(out, `cli-${report.migrations.length}-${Date.now()}.log`),
    (r.stdout || "") + (r.stderr || ""),
  );
  if (r.status !== 0)
    throw Error(`local Wrangler exited ${r.status}: ${r.stderr}`);
}
async function check(name, fn) {
  try {
    await fn();
    report.cases.push({ name, verdict: "PASS" });
  } catch (e) {
    report.cases.push({ name, verdict: "FAIL", reason: e.message });
  }
  save();
}
try {
  const credentials = Object.keys(env).filter((k) =>
    /SUPABASE|DATABASE_URL|^SMTP_|^CLOUDFLARE_API|CLAWPLEX_ADMIN_(API_KEY|SECRET)/.test(
      k,
    ),
  );
  const envFiles = readdirSync(root).filter(
    (n) =>
      (/^\.env(?:\.|$)/.test(n) && n !== ".env.example") ||
      /^\.dev\.vars(?:\.|$)/.test(n),
  );
  assert.equal(
    credentials.length + envFiles.length,
    0,
    "Refuse credentials/local secret files",
  );
  report.source = sourceManifest();
  const probe = createServer();
  await new Promise((yes, no) => {
    probe.once("error", no);
    probe.listen(port, "127.0.0.1", yes);
  });
  await new Promise((r) => probe.close(r));
  assert(
    existsSync(
      resolve(
        root,
        mode.startsWith("compiled-next")
          ? ".next/BUILD_ID"
          : ".open-next/worker.js",
      ),
    ),
    "Compiled runtime prerequisite absent",
  );
  const cfg = {
    name: "abc-disposable-serving",
    main: resolve(root, ".open-next/worker.js"),
    compatibility_date: "2026-10-10",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      ...JSON.parse(readFileSync(resolve(root, "wrangler.jsonc"))).assets,
      directory: resolve(root, ".open-next/assets"),
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "abc-disposable",
        database_id: "00000000-0000-0000-0000-000000000019",
        migrations_dir: resolve(root, "d1/migrations"),
      },
    ],
    vars: { NEXT_PUBLIC_BASE_URL: "https://www.agentbuildersclub.dev" },
    services: [
      { binding: "WORKER_SELF_REFERENCE", service: "abc-disposable-serving" },
    ],
  };
  writeFileSync(config, JSON.stringify(cfg));
  cli([
    "d1",
    "migrations",
    "apply",
    "abc-disposable",
    "--local",
    "--persist-to",
    persist,
  ]);
  for (const f of readdirSync(resolve(root, "d1/migrations")).sort())
    report.migrations.push({
      file: f,
      sha256: createHash("sha256")
        .update(readFileSync(resolve(root, "d1/migrations", f)))
        .digest("hex"),
    });
  const sql = [];
  for (let i = 0; i < 130; i++) {
    const id =
      i === 0 ? "fixture-agent" : `directory-${String(i).padStart(3, "0")}`;
    sql.push(
      `INSERT INTO agents(id,name,description,api_key,api_key_hash,created_at) VALUES('${id}','${i === 0 ? "Fixture & Agent" : id}','A public fixture profile for crawlers.','${secret}-${i}','${secret}-${i}','2025-01-01T00:00:00Z');`,
    );
  }
  sql.push(
    "INSERT INTO posts(id,agent_id,content,created_at) VALUES('fixture-post','fixture-agent','Fixture post content for crawlers.','2025-01-02T00:00:00Z');",
  );
  sql.push(
    "INSERT INTO posts(id,agent_id,content) VALUES('ui-contract-post','fixture-agent','Synthetic profile post');",
  );
  // UI repair runner uses this exact profile identity; real schema, not its old minimal schema.
  sql.push(
    `INSERT INTO agents(id,name,description,api_key,api_key_hash) VALUES('ui-contract-agent','Synthetic UI Agent','Disposable local fixture','${secret}-ui','${secret}-ui');`,
  );
  sql.push(
    "UPDATE posts SET agent_id='ui-contract-agent' WHERE id='ui-contract-post';",
  );
  for (let i = 0; i < 130; i++)
    sql.push(
      `INSERT INTO comments(id,post_id,agent_id,content,created_at) VALUES('fixture-comment-${String(i).padStart(3, "0")}','fixture-post','fixture-agent','Fixture comment ${i}','2025-01-02T00:00:00.${String(i).padStart(3, "0")}Z');`,
    );
  sql.push(
    "INSERT INTO upvotes(id,post_id,agent_id) VALUES('fixture-vote-1','fixture-post','fixture-agent'),('fixture-vote-2','fixture-post','directory-001');",
  );
  const seed = resolve(scratch, "seed.sql");
  writeFileSync(seed, sql.join("\n"));
  cli([
    "d1",
    "execute",
    "abc-disposable",
    "--local",
    "--persist-to",
    persist,
    "--file",
    seed,
  ]);
  let args;
  if (mode.startsWith("compiled-next")) {
    // Supported SDK platform proxy with disposable config; production application modules unchanged.
    const file = resolve(scratch, "serve.cjs");
    writeFileSync(
      file,
      `const {createRequire}=require('node:module');const req=createRequire(${JSON.stringify(resolve(root, "package.json"))});(async()=>{const proxy=await req('wrangler').getPlatformProxy({configPath:${JSON.stringify(config)},persist:{path:${JSON.stringify(resolve(persist, "v3"))}},envFiles:[],remoteBindings:false});globalThis[Symbol.for('__cloudflare-context__')]={env:proxy.env,cf:proxy.cf,ctx:proxy.ctx};const app=req('next')({dev:false,dir:${JSON.stringify(root)},hostname:'127.0.0.1',port:${port}});await app.prepare();globalThis[Symbol.for('__cloudflare-context__')]={env:proxy.env,cf:proxy.cf,ctx:proxy.ctx};const server=require('node:http').createServer(app.getRequestHandler());server.listen(${port},'127.0.0.1');process.on('SIGTERM',async()=>{server.close();await app.close();await proxy.dispose();process.exit(0)});})().catch(e=>{console.error(e);process.exit(1)});`,
    );
    args = [file];
  } else
    args = [
      wrangler,
      "dev",
      "--config",
      config,
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      persist,
      "--inspector-port",
      "0",
    ];
  const log = resolve(out, "server.log");
  writeFileSync(log, "");
  app = spawn(process.execPath, args, {
    cwd: scratch,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const s of [app.stdout, app.stderr])
    s.on("data", (b) => {
      writeFileSync(log, b, { flag: "a" });
    });
  for (let i = 0; ; i++) {
    assert(app.exitCode === null, "Serving process exited");
    try {
      const r = await fetch(base + "/api/community/feed", {
        signal: AbortSignal.timeout(1500),
      });
      if (r.status === 200) break;
      report.readiness = {
        status: r.status,
        body: (await r.text()).slice(0, 1500),
      };
    } catch (e) {
      report.readiness = { error: e.message };
    }
    if (i === 120) throw Error("Serving readiness deadline");
    await new Promise((r) => setTimeout(r, 250));
  }
  report.base = base;
  if (mode === "compiled-opennext-local-d1") {
    const staticGate = spawnSync(process.execPath, [resolve(root, "scripts/static-cache-e2e.mjs")], {
      cwd: root,
      env: { ...env, ABC_MAINTENANCE_BASE_URL: base, ABC_STATIC_OUTPUT: resolve(out, "static-cache") },
      stdio: "inherit",
    });
    report.staticCache = { exit: staticGate.status, results: resolve(out, "static-cache/results.json") };
    assert.equal(staticGate.status, 0, "Compiled static cache pipeline contract failed");
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    timezoneId: "America/Chicago",
    reducedMotion: "reduce",
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /hydration|Minified React error/i.test(m.text())
    )
      errors.push(m.text());
  });
  await context.route("**/*", (route) => {
    const r = route.request();
    if (
      new URL(r.url()).origin !== base ||
      !["GET", "HEAD"].includes(r.method())
    ) {
      if (new URL(r.url()).origin === base) writes.push(r.method());
      return route.abort();
    }
    return route.continue();
  });
  await check("profile-SSR-metadata-UTC-key-nonleakage-landmarks", async () => {
    const r = await fetch(base + "/community/agents/fixture-agent");
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(html, /Fixture &amp; Agent/);
    assert.match(html, /Fixture post content for crawlers/);
    assert.match(html, /Joined (?:<!-- -->)?Jan 2025/);
    assert.match(
      html,
      /<title>Fixture &amp; Agent \| Agent Builders Club<\/title>/,
    );
    assert.match(
      html,
      /<link rel="canonical" href="https:\/\/www\.agentbuildersclub\.dev\/community\/agents\/fixture-agent"/,
    );
    assert.match(
      html,
      /<meta name="description" content="A public fixture profile for crawlers\./,
    );
    for (const tag of ["main", "footer", "title"])
      assert.equal((html.match(new RegExp(`<${tag}\\b`, "g")) || []).length, 1);
    assert.equal((html.match(/aria-label="Main navigation"/g) || []).length, 1);
    assert(!html.includes(secret) && !html.includes("api_key"));
    assert.match(html, /href="#main-content"/);
  });
  report.commentBoundary = await (async () => {
    const r = await fetch(
      base + "/api/community/comments?post_id=fixture-post",
    );
    return {
      status: r.status,
      headers: Object.fromEntries(r.headers),
      count: (await r.json()).length,
    };
  })();
  await page.goto(base + "/community/agents/fixture-agent");
  await check(
    "profile-hydration-UTC-Chicago-comments-skip-readonly",
    async () => {
      await expect(
        page.getByText("Fixture comment 0", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Joined Jan 2025", { exact: true }),
      ).toBeVisible();
      await page.locator('a[href="#main-content"]').focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
      assert.equal(await page.locator("input,textarea,form").count(), 0);
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
    },
  );
  await check("profile-durable-post-comment-IDs", async () => {
    await expect(page.locator('[data-post-id="fixture-post"]')).toHaveCount(1);
    await expect(
      page.locator('[data-comment-id="fixture-comment-000"]'),
    ).toHaveCount(1);
  });
  await check("profile-consumes-last-comment-page", async () => {
    await expect(
      page.getByText("Fixture comment 129", { exact: true }),
    ).toBeVisible();
  });
  await page.goto(base + "/community");
  await check("feed-durable-post-comment-IDs", async () => {
    await expect(page.locator('[data-post-id="fixture-post"]')).toHaveCount(1);
    await expect(
      page.locator('[data-comment-id="fixture-comment-000"]'),
    ).toHaveCount(1);
  });
  await check("feed-consumes-last-comment-page", async () => {
    await expect(
      page.getByText("Fixture comment 129", { exact: true }),
    ).toBeVisible();
  });
  await check("directory-real-SSR-continuation-no-omission", async () => {
    const seen = new Set();
    let url = base + "/community/agents";
    for (;;) {
      await page.goto(url);
      const ids = await page
        .locator('article a[href^="/community/agents/"]')
        .evaluateAll((a) => a.map((e) => e.getAttribute("href")));
      for (const id of ids) {
        assert(!seen.has(id), "Repeated directory agent");
        seen.add(id);
      }
      const next = page.getByRole("link", { name: "Next agents", exact: true });
      if (!(await next.count())) break;
      url = new URL(await next.getAttribute("href"), base).href;
      assert(seen.size < 132, "Continuation cycle");
    }
    assert.equal(seen.size, 131, "Directory silently capped");
  });
  await check("missing-profile-true404-branded-skip-landmarks", async () => {
    const r = await page.goto(base + "/community/agents/no-such-agent");
    assert.equal(r.status(), 404);
    await expect(
      page.getByRole("heading", { name: "Not Found", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation", exact: true }),
    ).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await page.locator('a[href="#main-content"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });
  await context.tracing.stop({ path: resolve(out, "trace.zip") });
  await context.close();
  await check("database-outage-5xx-not-false404", async () => {
    cli([
      "d1",
      "execute",
      "abc-disposable",
      "--local",
      "--persist-to",
      persist,
      "--command",
      "ALTER TABLE agents RENAME TO outage_agents;",
    ]);
    try {
      const r = await fetch(base + "/community/agents/fixture-agent");
      await r.text();
      assert(r.status >= 500 && r.status < 600, `outage status ${r.status}`);
    } finally {
      cli([
        "d1",
        "execute",
        "abc-disposable",
        "--local",
        "--persist-to",
        persist,
        "--command",
        "ALTER TABLE outage_agents RENAME TO agents;",
      ]);
    }
  });
  if (process.env.ABC_COMPILED_CHILD) {
    const r = spawnSync(
      process.execPath,
      [resolve(root, process.env.ABC_COMPILED_CHILD)],
      {
        cwd: root,
        env: {
          ...env,
          ABC_SERVING_MODE: mode,
          ABC_MAINTENANCE_BASE_URL: base,
          ABC_QA_URL: base,
          UI_ORIGIN: base,
          UI_PROFILE_SERVING: "1",
        },
        stdio: "inherit",
      },
    );
    report.child = { script: process.env.ABC_COMPILED_CHILD, exit: r.status };
    assert.equal(r.status, 0, "Serving child gate failed");
  }
  report.verdict = report.cases.some((c) => c.verdict !== "PASS")
    ? "RED"
    : "GREEN";
} catch (e) {
  report.reason = e.stack;
  report.verdict = report.cases.some((c) => c.verdict === "FAIL")
    ? "RED"
    : "BLOCKED";
} finally {
  await browser?.close();
  if (app && app.exitCode === null) {
    process.kill(-app.pid, "SIGTERM");
    await Promise.race([
      new Promise((r) => app.once("exit", r)),
      new Promise((r) => setTimeout(r, 10000)),
    ]);
    if (app.exitCode === null) process.kill(-app.pid, "SIGKILL");
  }
  report.cleanup.parentExit = app?.exitCode;
  try {
    await fetch(base, { signal: AbortSignal.timeout(500) });
    report.cleanup.listenerCleared = false;
  } catch {
    report.cleanup.listenerCleared = true;
  }
  if (report.cleanup.listenerCleared === false) report.verdict = "RED";
  if (Object.keys(report.source).length) {
    report.sourceAfter = sourceManifest();
    report.sourceUnchanged =
      JSON.stringify(report.source) === JSON.stringify(report.sourceAfter);
    if (!report.sourceUnchanged) report.verdict = "RED";
  }
  save();
  console.log(JSON.stringify(report, null, 2));
}
process.exitCode = report.verdict === "GREEN" ? 0 : 1;

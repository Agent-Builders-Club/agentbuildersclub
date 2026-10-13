/* Scoped homepage contract, declared before implementation.
 * Source: node scripts/home-migration-e2e.cjs --source --out <scratch-dir>
 * Browser: HOME_E2E_URL=http://127.0.0.1:3000 node scripts/home-migration-e2e.cjs --out <scratch-dir>
 * Read-only: no RSVP, registration, form submission, or external navigation.
 * Parent owns server/build/shared UI; browser verdict is independent of source receipt.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : process.env.HOME_E2E_OUT;
if (!out) throw new Error('Supply --out <scratch-dir> for durable evidence');
fs.mkdirSync(out, { recursive: true });
const results = [];
function check(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.message }); } }
async function run() {
  const source = fs.readFileSync(path.join(root, 'src/app/home-client.tsx'), 'utf8');
  if (process.argv.includes('--source')) {
    check('central scheduling and action configuration', () => assert.match(source, /import\s+\{\s*siteConfig\s*\}\s+from\s+["']@\/config["']/));
    check('meetup-first hero and retired sections absent', () => {
      const hero = source.slice(source.indexOf('function HeroBanner'), source.indexOf('function WhatIsABC'));
      assert.match(hero, /View upcoming meetups/); assert.match(hero, /siteConfig\.lumaUrl/);
      assert.doesNotMatch(hero, /register|Join the Discord/);
      assert.doesNotMatch(source, /id="(?:community|projects)"|Copy prompt|curl -X POST/);
      assert.match(source, /label: "Socials"/); assert.match(source, /siteConfig\.socialsUrl/);
    });
    check('primary human actions and scheduling fallback', () => {
      assert.match(source, /siteConfig\.navigation/); assert.match(source, /siteConfig\.eventFallback/);
      assert.match(source, /id="events"/); assert.doesNotMatch(source, /id="projects"/);
    });
    check('no unsupported counts, universal promises or design copy', () => assert.doesNotMatch(source, /Premium through restraint|600\+|Every Node streams|every event streams|No tracking|Live demos only|fully automated|40\+ AI models|&apos;/));
    check('real identity and photo assets retained', () => {
      for (const token of ['/clawcon-1.webp', '/node-03-meetup.png', '/node-04-frisco-01.jpeg', '/node-06-hermes-arlington-03.webp', '/abc-logo.jpg', '/tyler-headshot.jpeg', '/anjal.png', '/amit.png', '/johnny.png', 'Tyler Delano', 'Anjal Parikh', 'Amit Arora', 'Jonny Hasling']) assert.ok(source.includes(token), token);
    });
  } else {
    const url = process.env.HOME_E2E_URL;
    if (!url || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) throw new Error('HOME_E2E_URL must be an explicit local preview origin');
    const { launchReadOnly } = require('./read-only-browser.cjs');
    let browser;
    try {
      for (const width of [390, 1440]) {
        const launched = await launchReadOnly(url, { viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
        browser = launched.browser; const context = launched.context;
        await context.tracing.start({ screenshots: true, snapshots: true });
        const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
        try {
          await page.goto(url, { waitUntil: 'networkidle' });
          const main = page.locator('main');
          await main.getByRole('link', { name: 'View upcoming meetups', exact: true }).waitFor();
          const calendar = await main.getByRole('link', { name: 'View upcoming meetups', exact: true }).getAttribute('href');
          check(`${width}: correct Luma calendar`, () => assert.equal(calendar, 'https://luma.com/agentbuildersclub'));
          for (const [label, href] of [['Events', '/events'], ['Socials', 'https://linktr.ee/agentbuildersclub'], ['Get Involved', '/get-involved'], ['Contact', '/contact']]) {
            const links = await main.getByRole('link', { name: label, exact: true }).evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
            check(`${width}: ${label} action`, () => assert.ok(links.includes(href)));
          }
          for (const section of ['events']) { await page.locator(`#${section}`).scrollIntoViewIfNeeded(); await page.waitForTimeout(800); }
          const body = await main.innerText();
          check(`${width}: copy and schedule honesty`, () => { assert.doesNotMatch(body, /&apos;|Premium through restraint|No tracking|Every Node streams|every event streams|600\+/); assert.match(body, /New meetup dates are posted on Luma/); assert.match(body, /founded in DFW/i); });
          const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
          check(`${width}: no horizontal overflow`, () => assert.ok(geometry.width <= geometry.viewport));
          check(`${width}: retired sections and Projects absent`, () => assert.ok(!/Keep building between meetups\.|Community spotlight/.test(body)));
          assert.equal(await main.locator('a[href="/community/projects"]').count(), 0);
          for (const name of ['Tyler Delano', 'Anjal Parikh', 'Amit Arora', 'Jonny Hasling']) { const img = main.getByRole('img', { name, exact: true }); await img.scrollIntoViewIfNeeded(); await img.evaluate(n => n.decode()); }
          check(`${width}: no page exceptions`, () => assert.deepEqual(errors, []));
          check(`${width}: no attempted writes`, () => assert.deepEqual(context.readOnlyEvidence.writes, []));
          await page.screenshot({ path: path.join(out, `home-${width}.png`), fullPage: true, animations: 'disabled' });
        } catch (e) { results.push({ name: `${width}: browser boundary`, passed: false, error: e.message }); }
        finally { await context.tracing.stop({ path: path.join(out, `home-${width}-trace.zip`) }); await context.close(); await browser.close(); }
      }
    } finally { await browser?.close(); }
  }
  const receipt = { boundary: process.argv.includes('--source') ? 'source acceptance (not rendered UI)' : 'local browser E2E', sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), results, passed: results.every(r => r.passed) };
  fs.writeFileSync(path.join(out, 'home-results.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2)); process.exitCode = receipt.passed ? 0 : 1;
}
run().catch(e => { fs.writeFileSync(path.join(out, 'home-harness-error.txt'), e.stack); console.error(e); process.exitCode = 1; });

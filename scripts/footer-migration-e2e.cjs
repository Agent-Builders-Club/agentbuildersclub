#!/usr/bin/env node
// Preimplementation contract: primary/secondary hierarchy, contact, branding,
// current meetup language, preserved socials, and no unsupported privacy claim.
// Source: node scripts/footer-migration-e2e.cjs --output /absolute/report.json
// Browser: add --url http://127.0.0.1:3000 (existing parent-owned server only).
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/components/footer.tsx'), 'utf8');
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const results = [];
const check = (name, passed) => results.push({ name, passed: Boolean(passed) });
const socials = [
  'https://www.linkedin.com/company/agentbuildersclub',
  'https://x.com/agntbuilderclub',
  'https://github.com/Agent-Builders-Club/agentbuildersclub',
];
check('shared configuration imported', /import\s*\{\s*siteConfig\s*\}\s*from\s*["']@\/config["']/.test(source));
check('primary links use shared navigation', source.includes('siteConfig.navigation.map'));
check('secondary links use shared community navigation', source.includes('siteConfig.communityNavigation.map'));
check('primary group precedes secondary', source.indexOf('siteConfig.navigation.map') >= 0 && source.indexOf('siteConfig.navigation.map') < source.indexOf('siteConfig.communityNavigation.map'));
check('accessible primary and secondary navigation', source.includes('aria-label="Main footer navigation"') && source.includes('aria-label="Community resources"'));
check('email contact from configuration', source.includes('mailto:${siteConfig.contactEmail}') && source.includes('{siteConfig.contactEmail}'));
check('Luma and Discord from configuration', source.includes('siteConfig.lumaUrl') && source.includes('siteConfig.discordUrl'));
check('meetup-first language without stale Node terminology', /Meetup calendar/.test(source) && !/Node Calendar|Live Events|Global AI Builder Community|Built for the world/.test(source));
check('no unsupported privacy or data-handling promise', !/never track|no tracking|never share|we don.t track|100% private|fully private/i.test(source));
check('branding and actual socials retained', source.includes('/abc-logo.jpg') && source.includes('siteConfig.name') && socials.every((url) => source.includes(url)));
const parsed = ts.createSourceFile('footer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
check('valid TSX syntax', parsed.parseDiagnostics.length === 0);
(async () => {
  if (args.includes('--url')) {
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    try {
      await page.goto(option('--url'), { waitUntil: 'networkidle' });
      const footer = page.locator('footer');
      const main = footer.getByRole('navigation', { name: 'Main footer navigation', exact: true });
      const secondary = footer.getByRole('navigation', { name: 'Community resources', exact: true });
      check('browser primary destinations', JSON.stringify(await main.locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href')))) === JSON.stringify(['/events', '/community/projects', '/get-involved', '/contact']));
      check('browser secondary destinations', JSON.stringify(await secondary.locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href')))) === JSON.stringify(['/community', '/community/agents', '/skills']));
      check('browser contact email', await footer.locator('a[href="mailto:hello@agentbuildersclub.dev"]').count() === 1);
      check('browser social links retained', (await footer.locator('a').evaluateAll((links) => links.map((a) => a.href))).filter((href) => socials.includes(href)).length === socials.length);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await footer.scrollIntoViewIfNeeded();
        check(`browser footer visible at ${width}`, await footer.isVisible());
        check(`browser no horizontal overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (args.includes('--output')) await footer.screenshot({ path: `${option('--output')}.${width}.png` });
      }
    } catch (error) {
      results.push({ name: 'browser contract execution', passed: false, error: error.message });
    } finally {
      if (args.includes('--output')) await context.tracing.stop({ path: `${option('--output')}.trace.zip` });
      await browser.close();
    }
  }
  const report = { mode: args.includes('--url') ? 'source-and-browser' : 'source-only', passed: results.every((r) => r.passed), results };
  if (args.includes('--output')) {
    fs.mkdirSync(path.dirname(option('--output')), { recursive: true });
    fs.writeFileSync(option('--output'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.passed ? 0 : 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });

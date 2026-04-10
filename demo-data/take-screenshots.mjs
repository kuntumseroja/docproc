import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/priyo/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const BASE = 'http://localhost:3000';
const OUT = '/Users/priyo/Downloads/AI-Asset/DocProc/docproc-poc/demo-data/screenshots';

async function login(context, token) {
  const page = await context.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify({
      email: 'admin@docproc.demo', full_name: 'Sarah Chen', role: 'sme'
    }));
  }, token);
  return page;
}

(async () => {
  // Get token
  const res = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@docproc.demo', password: 'demo1234' }),
  });
  const { access_token: token } = await res.json();
  console.log('Logged in, token obtained');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // ── Simple pages ──
  const simplePages = [
    { name: '01-dashboard',        path: '/' },
    { name: '02-workflow-builder',  path: '/workflows/new' },
    { name: '03-upload',           path: '/upload' },
    { name: '04-data-repository',  path: '/repository' },
    { name: '06-login',            path: '/login', skipAuth: true },
  ];

  for (const pg of simplePages) {
    const page = pg.skipAuth ? await context.newPage() : await login(context, token);
    await page.goto(BASE + pg.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${pg.name}.png`, fullPage: false });
    console.log(`  ✓ ${pg.name}.png`);
    await page.close();
  }

  // ── Review page with document selected (extraction results) ──
  {
    const page = await login(context, token);
    await page.goto(BASE + '/review', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Select the 5th option (globex_inv_9847 - completed)
    await page.selectOption('select', { index: 4 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/07-extraction-results.png`, fullPage: false });
    console.log('  ✓ 07-extraction-results.png');

    // Full page screenshot for extraction (captures validation too if below)
    await page.screenshot({ path: `${OUT}/07-extraction-results-full.png`, fullPage: true });
    console.log('  ✓ 07-extraction-results-full.png');
    await page.close();
  }

  // ── Chat with a conversation ──
  {
    const page = await login(context, token);
    await page.goto(BASE + '/chat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Take empty chat screenshot
    await page.screenshot({ path: `${OUT}/05-chat.png`, fullPage: false });
    console.log('  ✓ 05-chat.png');

    // Type a question and send
    const input = await page.$('input[type="text"], textarea');
    if (input) {
      await input.fill('What is the total value of all completed invoices?');
      await page.waitForTimeout(500);

      // Screenshot with question typed
      await page.screenshot({ path: `${OUT}/08-chat-with-query.png`, fullPage: false });
      console.log('  ✓ 08-chat-with-query.png');
    }
    await page.close();
  }

  // ── Settings page ──
  {
    const page = await login(context, token);
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/09-settings.png`, fullPage: false });
    console.log('  ✓ 09-settings.png');
    await page.close();
  }

  await browser.close();
  console.log(`\nDone! All screenshots saved to ${OUT}/`);
})();

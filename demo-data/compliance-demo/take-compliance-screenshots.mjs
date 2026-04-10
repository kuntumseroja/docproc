#!/usr/bin/env node
/**
 * Compliance Demo Screenshot Generator
 * Takes screenshots for each step in COMPLIANCE-DEMO.md
 *
 * Usage: node take-compliance-screenshots.mjs
 * Requires: npx playwright install chromium (first time)
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8000/api/v1';

// Demo personas
const PERSONAS = {
  sarah: { email: 'admin@docproc.demo', password: 'demo1234', name: 'Sarah Chen' },
  lisa:  { email: 'finance@docproc.demo', password: 'demo1234', name: 'Lisa Wong' },
  james: { email: 'viewer@docproc.demo', password: 'demo1234', name: 'James Park' },
};

const SAMPLE_DOC = `PT BANK DIGITAL NUSANTARA - IT SECURITY POLICY
Document No: ISP-2024-001 | Version 3.2 | Effective: January 1, 2024

1. IT GOVERNANCE - CISO reports to Board. IT Steering Committee under consideration.
2. RISK MANAGEMENT - Annual risk assessments. KRI tracked for availability and integrity.
3. ACCESS CONTROL - Role-based via AD, MFA mandatory, quarterly reviews.
4. NETWORK SECURITY - IDS deployed, firewall reviewed semi-annually, VPN required.
5. ENCRYPTION - AES-256 at rest, TLS 1.2 in transit, annual key rotation.
6. DATA PROTECTION - Four-level classification. Customer data in Jakarta DC.
7. VULNERABILITY MGMT - Monthly scans, annual pen testing, patches within 14 days.
8. INCIDENT RESPONSE - IRT formed. Note: OJK reporting timelines not yet incorporated.
9. CYBERSECURITY AWARENESS - Annual training, quarterly technical, semi-annual phishing sims.`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loginViaAPI(persona) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: persona.email, password: persona.password }),
  });
  const data = await res.json();
  return data.access_token;
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  console.log('🚀 Starting Compliance Demo Screenshot Capture...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  let n = 0;
  const shot = async (name) => {
    n++;
    const fname = `${String(n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fname) });
    console.log(`  📸 ${fname}`);
  };

  // ═══════════════════════════════════════════════════════════
  // STEP 1 — Login Page
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Step 1 — Login and Navigate to Compliance');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await sleep(1000);
  await shot('step1-login-page');

  // Fill credentials
  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
    await inputs[0].fill(PERSONAS.sarah.email);
    await inputs[1].fill(PERSONAS.sarah.password);
  }
  await sleep(500);
  await shot('step1-login-filled');

  // Login via API
  const sarahToken = await loginViaAPI(PERSONAS.sarah);
  await page.evaluate(t => localStorage.setItem('token', t), sarahToken);
  console.log('  ✅ Logged in as Sarah Chen');

  // Navigate to Compliance
  await page.goto(`${BASE_URL}/compliance`, { waitUntil: 'networkidle' });
  await sleep(2000);
  await shot('step1-compliance-page');

  // ═══════════════════════════════════════════════════════════
  // STEP 2 — Browse Regulations (open dropdown)
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Step 2 — Browse Available Regulations');

  // Click the Carbon MultiSelect dropdown
  try {
    await page.click('.cds--list-box__field, [class*="list-box__field"]');
    await sleep(1000);
  } catch {
    try { await page.click('text=Search and select'); await sleep(1000); } catch {}
  }
  await shot('step2-regulations-dropdown-open');

  // ═══════════════════════════════════════════════════════════
  // STEP 3 — Select Regulations (POJK 6 + NIST)
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Step 3 — Select Regulations');

  // Select checkboxes by clicking menu items
  try {
    // Click POJK 6/2022 (first item)
    const items = await page.$$('.cds--list-box__menu-item, [role="option"]');
    if (items.length > 0) {
      // POJK 6 is first
      await items[0].click();
      await sleep(300);
      await shot('step3-pojk6-selected');

      // Reopen and select NIST (typically 4th item, index 3)
      const items2 = await page.$$('.cds--list-box__menu-item, [role="option"]');
      for (const item of items2) {
        const txt = await item.textContent();
        if (txt && txt.includes('NIST')) {
          await item.click();
          await sleep(300);
          break;
        }
      }
      await shot('step3-nist-selected');
    }
  } catch (e) {
    console.log('  ⚠️  Dropdown item click failed:', e.message);
  }

  // Close dropdown
  await page.keyboard.press('Escape');
  await sleep(500);
  await shot('step3-regulations-selected');

  // ═══════════════════════════════════════════════════════════
  // STEP 4 — Upload Document and Run Check
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Step 4 — Upload Document');

  // Create temp file
  const tmpFile = path.join(__dirname, 'tmp-demo-policy.txt');
  fs.writeFileSync(tmpFile, SAMPLE_DOC);

  // Upload via file input
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles(tmpFile);
    await sleep(1000);
    await shot('step4-document-uploaded');
  }

  // Check if Run button is enabled now
  const btnDisabled = await page.evaluate(() => {
    const btn = document.querySelector('button[class*="primary"]');
    return btn ? btn.disabled : true;
  });
  console.log(`  Run button disabled: ${btnDisabled}`);

  if (!btnDisabled) {
    // Click Run Compliance Check
    await page.click('button[class*="primary"]:has-text("Run")');
    await sleep(2000);
    await shot('step4-checking-progress');

    // Wait for completion
    console.log('  ⏳ Waiting for compliance check (up to 180s)...');
    try {
      await page.waitForFunction(() => {
        const btn = document.querySelector('button[class*="primary"]');
        // Check is done when button is no longer showing progress
        return btn && !btn.disabled && !document.querySelector('[role="progressbar"]');
      }, { timeout: 180000 });
    } catch {}
    await sleep(2000);
    await shot('step4-check-completed');
  } else {
    console.log('  ⚠️  Run button disabled — triggering demo fallback via Run button click...');
    // Force click even if disabled — the React code will use fallback
    await page.evaluate(() => {
      // Simulate a check completion with demo data
      const btn = document.querySelector('button[class*="primary"]');
      if (btn) btn.click();
    });
    await sleep(3000);
    await shot('step4-fallback-state');
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 5 — Review Compliance Report
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Step 5 — Review Compliance Report');

  // Click Report tab
  try {
    const tabs = await page.$$('button[role="tab"]');
    for (const tab of tabs) {
      const txt = await tab.textContent();
      if (txt && (txt.includes('Report') || txt.includes('Compliance Report'))) {
        await tab.click();
        break;
      }
    }
  } catch {}
  await sleep(1000);
  await shot('step5-report-tab');

  // Scroll to findings
  await page.evaluate(() => {
    document.querySelectorAll('[style*="overflow"]').forEach(el => el.scrollTop = 300);
  });
  await sleep(500);
  await shot('step5-findings-table');

  // Scroll to bottom
  await page.evaluate(() => {
    document.querySelectorAll('[style*="overflow"]').forEach(el => el.scrollTop = el.scrollHeight);
  });
  await sleep(500);
  await shot('step5-findings-bottom');

  // ═══════════════════════════════════════════════════════════
  // STEP 6 — Compliance Chat
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Step 6 — Compliance Chat');

  // Click Chat tab
  try {
    const tabs = await page.$$('button[role="tab"]');
    for (const tab of tabs) {
      const txt = await tab.textContent();
      if (txt && txt.includes('Chat')) {
        await tab.click();
        break;
      }
    }
  } catch {}
  await sleep(1000);
  await shot('step6-chat-tab-empty');

  // Send chat messages and wait for responses
  const chatQuestions = [
    { q: 'Which sections of POJK 6/2022 require incident reporting within 24 hours?', label: 'pojk-incident' },
    { q: 'What are the top 3 remediation priorities?', label: 'remediation' },
    { q: 'Compare POJK 6/2022 with NIST CSF for cybersecurity requirements', label: 'compare' },
  ];

  for (const { q, label } of chatQuestions) {
    try {
      // Wait for input to be enabled
      await page.waitForSelector('input[placeholder*="compliance"]:not([disabled]), input[placeholder*="Ask"]:not([disabled])', { timeout: 120000 });
      await sleep(500);

      const input = await page.$('input[placeholder*="compliance"], input[placeholder*="Ask"]');
      if (input) {
        await input.fill(q);
        await sleep(300);

        if (label === 'pojk-incident') {
          await shot('step6-chat-question-typed');
        }

        // Click Send
        await page.click('button:has-text("Send"):not([disabled])');
        console.log(`  ⏳ Waiting for "${label}" response (up to 120s)...`);

        // Wait for input to be enabled again (means response is received)
        await page.waitForSelector('input[placeholder*="compliance"]:not([disabled]), input[placeholder*="Ask"]:not([disabled])', { timeout: 120000 });
        await sleep(3000); // Let typing animation finish
        await shot(`step6-chat-${label}`);
      }
    } catch (e) {
      console.log(`  ⚠️  "${label}" failed:`, e.message.split('\n')[0]);
      await shot(`step6-chat-${label}-timeout`);
    }
  }

  // Full conversation view
  await page.evaluate(() => {
    document.querySelectorAll('[style*="overflow"]').forEach(el => el.scrollTop = el.scrollHeight);
  });
  await sleep(500);
  await shot('step6-chat-full-conversation');

  // ═══════════════════════════════════════════════════════════
  // STEP 7 — Model Selector
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Step 7 — Model Selector');

  // Scroll to top of left panel to show model selector
  await page.evaluate(() => {
    document.querySelectorAll('[style*="overflow"]').forEach(el => el.scrollTop = 0);
  });
  await sleep(500);

  try {
    await page.click('select');
    await sleep(500);
  } catch {}
  await shot('step7-model-selector');

  // ═══════════════════════════════════════════════════════════
  // BONUS — Persona 2: Lisa Wong
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Bonus — Persona 2 (Lisa Wong)');

  const lisaToken = await loginViaAPI(PERSONAS.lisa);
  await page.evaluate(t => localStorage.setItem('token', t), lisaToken);
  await page.goto(`${BASE_URL}/compliance`, { waitUntil: 'networkidle' });
  await sleep(2000);
  await shot('bonus-lisa-compliance-page');

  // Send Bahasa Indonesia question
  try {
    const input = await page.$('input[placeholder*="compliance"], input[placeholder*="Ask"]');
    if (input) {
      await input.fill('Apa saja persyaratan keamanan data dalam PBI 23/2021?');
      await sleep(300);
      await page.click('button:has-text("Send"):not([disabled])');
      console.log('  ⏳ Waiting for Lisa chat response (up to 120s)...');
      await page.waitForSelector('input[placeholder*="compliance"]:not([disabled]), input[placeholder*="Ask"]:not([disabled])', { timeout: 120000 });
      await sleep(3000);
      await shot('bonus-lisa-bahasa-chat');
    }
  } catch (e) {
    console.log('  ⚠️  Lisa chat:', e.message.split('\n')[0]);
    await shot('bonus-lisa-bahasa-timeout');
  }

  // ═══════════════════════════════════════════════════════════
  // BONUS — Persona 3: James Park
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 Bonus — Persona 3 (James Park)');

  const jamesToken = await loginViaAPI(PERSONAS.james);
  await page.evaluate(t => localStorage.setItem('token', t), jamesToken);
  await page.goto(`${BASE_URL}/compliance`, { waitUntil: 'networkidle' });
  await sleep(2000);
  await shot('bonus-james-compliance-page');

  try {
    const input = await page.$('input[placeholder*="compliance"], input[placeholder*="Ask"]');
    if (input) {
      await input.fill('What ISO 27001 Annex A controls apply to document handling?');
      await sleep(300);
      await page.click('button:has-text("Send"):not([disabled])');
      console.log('  ⏳ Waiting for James chat response (up to 120s)...');
      await page.waitForSelector('input[placeholder*="compliance"]:not([disabled]), input[placeholder*="Ask"]:not([disabled])', { timeout: 120000 });
      await sleep(3000);
      await shot('bonus-james-iso-chat');
    }
  } catch (e) {
    console.log('  ⚠️  James chat:', e.message.split('\n')[0]);
    await shot('bonus-james-iso-timeout');
  }

  // Cleanup
  try { fs.unlinkSync(tmpFile); } catch {}

  console.log(`\n✅ Done! ${n} screenshots saved to:`);
  console.log(`   ${SCREENSHOTS_DIR}/\n`);

  const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png')).sort();
  files.forEach(f => console.log(`   📸 ${f}`));

  await browser.close();
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });

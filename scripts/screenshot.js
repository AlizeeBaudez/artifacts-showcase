#!/usr/bin/env node
/**
 * screenshot.js — capture a WebP thumbnail of an HTML artifact
 *
 * Usage:
 *   node scripts/screenshot.js artifacts/foo.html   → one file
 *   node scripts/screenshot.js --all               → all entries in showcase.json
 */

const puppeteer   = require('puppeteer');
const path        = require('path');
const fs          = require('fs');

const REPO_ROOT       = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(REPO_ROOT, 'artifacts', 'screenshots');
const SHOWCASE_JSON   = path.join(REPO_ROOT, 'showcase.json');
const VIEWPORT        = { width: 1280, height: 800 };
const WAIT_MS         = 2800; // headroom for fonts + Chart.js renders

async function screenshotFile(htmlRelPath) {
  const htmlAbs  = path.resolve(REPO_ROOT, htmlRelPath);
  const basename = path.basename(htmlRelPath, '.html');
  const outPath  = path.join(SCREENSHOTS_DIR, basename + '.webp');

  if (!fs.existsSync(htmlAbs)) {
    console.error(`  ✗ not found: ${htmlRelPath}`);
    return false;
  }

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    // Load page; wait for network to settle then give extra time for canvas/fonts
    await page.goto(`file://${htmlAbs}`, { waitUntil: 'networkidle2', timeout: 25000 })
      .catch(() => page.goto(`file://${htmlAbs}`, { waitUntil: 'domcontentloaded', timeout: 25000 }));

    await new Promise(r => setTimeout(r, WAIT_MS));

    await page.screenshot({
      path:    outPath,
      type:    'webp',
      quality: 84,
      clip:    { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height }
    });

    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`  ✓ ${basename}.webp  (${kb} KB)`);
    return true;

  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--all') {
    const data      = JSON.parse(fs.readFileSync(SHOWCASE_JSON, 'utf8'));
    const artifacts = data.artifacts || [];
    console.log(`Screenshotting ${artifacts.length} artifacts…\n`);
    let ok = 0;
    for (const a of artifacts) {
      process.stdout.write(`${a.id}\n`);
      const success = await screenshotFile(a.file);
      if (success) ok++;
    }
    console.log(`\nDone — ${ok}/${artifacts.length} screenshots generated`);
    console.log(`Saved to: artifacts/screenshots/`);

  } else if (args[0]) {
    await screenshotFile(args[0]);

  } else {
    console.error('Usage:\n  node scripts/screenshot.js artifacts/foo.html\n  node scripts/screenshot.js --all');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});

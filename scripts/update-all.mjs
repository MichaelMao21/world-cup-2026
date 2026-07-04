import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
const log = (msg) => console.log(`[update] ${new Date().toISOString().slice(0,19).replace('T',' ')} ${msg}`);

// --- Step 1: Extract from Chrome ---
log("Step 1/4: Extracting from Chrome...");
try {
  const extract = execSync(
    `osascript -l JavaScript scripts/extract-active-chrome-page.js`,
    { cwd: PROJECT, timeout: 120000, encoding: "utf8" }
  );
  const result = JSON.parse(extract);
  if (!result.written) throw new Error("extract script did not write output");
  log(`  ✓ Got ${result.matchCount} match cards`);
} catch (e) {
  log(`  ✗ Chrome extraction failed: ${e.message}`);
  log("  Trying scrape:fifa API fallback...");
  try {
    execSync(`node scripts/scrape-fifa.mjs --output data/fifa-worldcup-raw.json`,
      { cwd: PROJECT, timeout: 60000, stdio: "inherit" });
    log("  ✓ scrape:fifa completed (check quality manually)");
  } catch (e2) {
    log(`  ✗ API fallback also failed: ${e2.message}`);
    process.exit(1);
  }
}

// --- Step 2: Normalize ---
log("Step 2/4: Normalizing match data...");
try {
  execSync(`node scripts/normalize-fifa-matches.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });
  log("  ✓ Normalized");
} catch (e) {
  log(`  ✗ Normalize failed: ${e.message}`);
  process.exit(1);
}

// --- Step 3: Build prototype data ---
log("Step 3/4: Building prototype data...");
try {
  execSync(`node scripts/build-prototype-data.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });
  log("  ✓ Built");
} catch (e) {
  log(`  ✗ Build failed: ${e.message}`);
  process.exit(1);
}

// --- Step 4: Build H5 ---
log("Step 4/5: Building H5...");
try {
  execSync(`node scripts/build-h5.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });
  log("  ✓ Built");
} catch (e) {
  log(`  ✗ Build failed: ${e.message}`);
  process.exit(1);
}

// --- Step 5: Publish to Miaoda + GitHub Pages ---
log("Step 5/5: Publishing...");
let miaodaOk = false, ghOk = false;
try {
  execSync(`lark-cli apps +html-publish --app-id app_4kem9q6px8by3 --path ./dist --as user`,
    { cwd: PROJECT, timeout: 60000, stdio: "inherit" });
  log("  ✓ Miaoda published");
  miaodaOk = true;
} catch (e) {
  log(`  ✗ Miaoda publish failed: ${e.message}`);
}
try {
  execSync(`node scripts/push-github-pages.mjs`, { cwd: PROJECT, timeout: 60000, stdio: "inherit" });
  log("  ✓ GitHub Pages published");
  ghOk = true;
} catch (e) {
  log(`  ✗ GitHub Pages publish failed: ${e.message}`);
}
if (!miaodaOk && !ghOk) {
  log("  Both publish targets failed!");
  process.exit(1);
}

// --- Summary ---
const matches = JSON.parse(await readFile(`${PROJECT}/data/fifa-matches.json`, "utf8"));
log(`Done. ${matches.counts.completed} completed / ${matches.counts.scheduled} scheduled / ${matches.counts.matches} total`);

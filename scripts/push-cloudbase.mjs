import { execSync } from "node:child_process";
import { resolve } from "node:path";

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
const ENV_ID = "worldcup2026-d7gfmdarw394a4109";
const log = (msg) => console.log(`[tcb] ${msg}`);

log("Deploying to CloudBase...");
try {
  const out = execSync(`tcb hosting deploy dist/ -e ${ENV_ID}`, {
    cwd: PROJECT,
    timeout: 120000,
    encoding: "utf8",
  });
  const urlMatch = out.match(/https:\/\/[^\s]+\.tcloudbaseapp\.com/);
  if (urlMatch) log(`  ✓ ${urlMatch[0]}`);
  else log("  ✓ Deployed");
} catch (e) {
  log(`  ✗ CloudBase deploy failed: ${e.message}`);
  process.exit(1);
}

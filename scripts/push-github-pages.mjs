import { rm, mkdir, access } from "node:fs/promises";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { constants } from "node:fs";

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
const PAGES_REPO = resolve(PROJECT, ".github-pages");
const GITHUB_REMOTE = "https://github.com/Derek2026/world-cup-2026.git";

const log = (msg) => console.log(`[gh-pages] ${msg}`);

// Step 1: Ensure repo exists with remote
let hasGit = false;
try {
  await access(resolve(PAGES_REPO, ".git"), constants.F_OK);
  hasGit = true;
} catch { /* init needed */ }

if (!hasGit) {
  await rm(PAGES_REPO, { recursive: true, force: true });
  await mkdir(PAGES_REPO, { recursive: true });
  execSync("git init", { cwd: PAGES_REPO, timeout: 5000 });
  execSync(`git remote add origin ${GITHUB_REMOTE}`, { cwd: PAGES_REPO, timeout: 5000 });
  log("Initialized repo");
}

// Step 2: Sync with remote
execSync("gh auth setup-git -h github.com", { cwd: PAGES_REPO, timeout: 10000, stdio: "pipe" });
try {
  execSync("git fetch origin master --depth=1", { cwd: PAGES_REPO, timeout: 60000, stdio: "pipe" });
  execSync("git reset --hard origin/master", { cwd: PAGES_REPO, timeout: 10000, stdio: "pipe" });
  log("Synced");
} catch {
  log("First push / empty remote, proceeding");
}

// Step 3: Replace with fresh dist files (keep .git)
const files = execSync("ls -A", { cwd: PAGES_REPO, encoding: "utf8", timeout: 3000 })
  .split("\n").filter(f => f && f !== ".git");
for (const f of files) {
  await rm(resolve(PAGES_REPO, f), { recursive: true, force: true });
}

const dist = resolve(PROJECT, "dist");
execSync(`cp -r "${resolve(dist, "index.html")}" "${PAGES_REPO}/"`, { timeout: 5000, shell: true });
execSync(`cp -r "${resolve(dist, "data")}" "${PAGES_REPO}/"`, { timeout: 5000, shell: true });
execSync(`cp -r "${resolve(dist, "js")}" "${PAGES_REPO}/"`, { timeout: 5000, shell: true });
log("Copied dist files");

// Step 4: Commit and push
const status = execSync("git status --porcelain", { cwd: PAGES_REPO, encoding: "utf8", timeout: 3000 });
if (!status.trim()) {
  log("No changes, up to date");
  process.exit(0);
}

execSync("git add -A", { cwd: PAGES_REPO, timeout: 3000 });
const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
execSync(`git commit -m "Update ${ts}"`, { cwd: PAGES_REPO, timeout: 5000, stdio: "pipe" });
execSync("git push origin master", { cwd: PAGES_REPO, timeout: 120000, stdio: "pipe" });
log("Published ✅");

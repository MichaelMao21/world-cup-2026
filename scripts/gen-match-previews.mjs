/**
 * gen-match-previews.mjs
 *
 * Generates AI-powered Chinese pre-match previews for matches in the next 48 hours.
 * Uses Claude Haiku (fast, low cost) with team form data from our match history.
 *
 * Usage:
 *   node scripts/gen-match-previews.mjs              # next 48h matches (skip if < 12h old)
 *   node scripts/gen-match-previews.mjs --force      # regenerate all upcoming matches
 *   node scripts/gen-match-previews.mjs --dry-run    # preview output without saving
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const PROJECT = resolve(".");

// Auto-load .env if ANTHROPIC_API_KEY not already set
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const env = await readFile(resolve(PROJECT, ".env"), "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  } catch { /* .env not found, will fail below with clear message */ }
}
const MATCHES_PATH = resolve(PROJECT, "data/fifa-matches.json");
const PREVIEWS_PATH = resolve(PROJECT, "data/match-previews.json");

const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
  console.error("  export ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

const client = new Anthropic();

const STAGE_CN = {
  "First Stage": "小组赛", "Round of 32": "32强赛", "Round of 16": "16强赛",
  "Quarter-final": "四分之一决赛", "Semi-final": "半决赛",
  "Play-off for third place": "季军赛", "Final": "决赛"
};

function parseBeijingKickoff(dateText, timeText) {
  const months = { January:"01",February:"02",March:"03",April:"04",May:"05",June:"06",
    July:"07",August:"08",September:"09",October:"10",November:"11",December:"12" };
  const parts = String(dateText || "").split(/\s+/);
  if (parts.length < 4) return null;
  const month = months[parts[2]];
  if (!month) return null;
  const day = parts[1].padStart(2, "0");
  const year = parts[3];
  const [hh, mm] = String(timeText || "").split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(`${year}-${month}-${day}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00+08:00`);
}

function getRecentResults(matches, teamName, count = 5) {
  return matches
    .filter(m => m.status === "completed" && (m.homeTeam === teamName || m.awayTeam === teamName))
    .slice(-count)
    .map(m => {
      const isHome = m.homeTeam === teamName;
      const scored = Number(isHome ? m.homeScore : m.awayScore);
      const conceded = Number(isHome ? m.awayScore : m.homeScore);
      const opp = isHome ? m.awayTeam : m.homeTeam;
      const result = scored > conceded ? "胜" : scored < conceded ? "负" : "平";
      return `${result} ${scored}-${conceded} vs ${opp}（${STAGE_CN[m.stage] || m.stage}）`;
    });
}

async function generatePreview(match, allMatches) {
  const homeRecent = getRecentResults(allMatches, match.homeTeam);
  const awayRecent = getRecentResults(allMatches, match.awayTeam);

  const prompt = `你是专业足球评论员，为2026年世界杯用户生成简洁的中文赛前前瞻。

比赛信息：
- 对阵：${match.homeTeam}（主场）vs ${match.awayTeam}（客场）
- 赛段：${STAGE_CN[match.stage] || match.stage}
- 时间：${match.dateText} ${match.time} 北京时间
- 场馆：${match.venue || "待定"}${match.city ? "，" + match.city : ""}

${match.homeTeam} 本届赛事近期战绩：
${homeRecent.length ? homeRecent.join("\n") : "暂无记录"}

${match.awayTeam} 本届赛事近期战绩：
${awayRecent.length ? awayRecent.join("\n") : "暂无记录"}

请严格按JSON格式返回，不要任何额外文字：
{
  "headline": "一句话吸引眼球的标题（15-25字，体现本场最大悬念或看点）",
  "preview": "综合赛前分析（150-220字），涵盖：双方近期状态、战术特点、历史交锋印象、关键因素、赛果预判",
  "keyPoints": [
    "看点一：核心球员或战术焦点（20-35字）",
    "看点二：双方优劣势对比（20-35字）",
    "看点三：决定胜负的关键变量（20-35字）"
  ]
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]);
}

// ── Main ──────────────────────────────────────────────────────────────

const matchData = JSON.parse(await readFile(MATCHES_PATH, "utf8"));
const matches = matchData.matches || [];

let existing = { generatedAt: null, previews: {} };
try {
  existing = JSON.parse(await readFile(PREVIEWS_PATH, "utf8"));
} catch { /* first run, start fresh */ }

const now = Date.now();
const window48h = now + 48 * 60 * 60 * 1000;

const targets = matches.filter(m => {
  if (m.status !== "scheduled") return false;
  const kickoff = parseBeijingKickoff(m.dateText, m.time);
  if (!kickoff) return false;
  return kickoff.getTime() >= now && kickoff.getTime() <= window48h;
});

console.log(`Found ${targets.length} scheduled match(es) in next 48h`);

let updated = 0;
for (const match of targets) {
  const prev = existing.previews[match.id];
  if (!force && prev) {
    const ageHours = (now - new Date(prev.generatedAt).getTime()) / 3_600_000;
    if (ageHours < 12) {
      console.log(`  ${match.homeTeam} vs ${match.awayTeam} — skip (${Math.round(ageHours)}h old)`);
      continue;
    }
  }

  process.stdout.write(`  ${match.homeTeam} vs ${match.awayTeam} ...`);
  try {
    const preview = await generatePreview(match, matches);
    existing.previews[match.id] = {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      generatedAt: new Date().toISOString(),
      ...preview,
    };
    console.log(` ✓  "${preview.headline}"`);
    updated++;
  } catch (e) {
    console.log(` ✗  ${e.message}`);
  }
}

// Clean up previews for matches that are now completed
const completedIds = new Set(matches.filter(m => m.status === "completed").map(m => m.id));
for (const id of Object.keys(existing.previews)) {
  if (completedIds.has(id)) delete existing.previews[id];
}

if (!dryRun) {
  existing.generatedAt = new Date().toISOString();
  await writeFile(PREVIEWS_PATH, JSON.stringify(existing, null, 2), "utf8");
  if (updated > 0) console.log(`\nSaved ${updated} new preview(s) to data/match-previews.json`);
  else console.log("\nNo new previews generated.");
} else {
  console.log("\n[dry-run] Nothing saved.");
}

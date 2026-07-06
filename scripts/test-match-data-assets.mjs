import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile("prototype.html", "utf8");
if (/const\s+PLAYER_STATS\s*=\s*\{/.test(html)) {
  throw new Error("PLAYER_STATS must come from data/prototype-data.js, not a hardcoded object in prototype.html");
}

const source = await readFile("data/prototype-data.js", "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const data = context.window.PROTOTYPE_DATA || {};

if (!data.playerStats) throw new Error("PROTOTYPE_DATA.playerStats is missing");
if (!Array.isArray(data.playerStats.goldenBoot) || data.playerStats.goldenBoot.length < 5) {
  throw new Error("playerStats.goldenBoot must contain synced scorer leaders");
}
if (!Array.isArray(data.playerStats.distribution) || data.playerStats.distribution.length < 5) {
  throw new Error("playerStats.distribution must contain synced assist leaders");
}
if (!data.teamStats || !Array.isArray(data.teamStats.rows) || data.teamStats.rows.length < 10) {
  throw new Error("PROTOTYPE_DATA.teamStats.rows is missing");
}
if (!Array.isArray(data.playerStats.audit?.eventGoldenBoot) || data.playerStats.audit.eventGoldenBoot.length < 5) {
  throw new Error("playerStats.audit.eventGoldenBoot must contain independent goal-event totals");
}

console.log(`Match data assets passed: ${data.playerStats.goldenBoot.length} scorers, ${data.teamStats.rows.length} teams`);

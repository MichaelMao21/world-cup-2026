import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const html = await readFile(resolve("prototype.html"), "utf8");
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
for (const source of inlineScripts) {
  new Function(source);
}

const requiredIds = [
  "challenge-match",
  "save-prediction-button",
  "invite-prediction-button",
  "pk-room-participants",
  "profile-dialog",
  "leaderboard-list",
];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required element #${id}`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate element ids: ${[...new Set(duplicateIds)].join(", ")}`);

console.log(`Checked ${inlineScripts.length} inline script, ${ids.length} element ids and ${requiredIds.length} prediction UI contracts`);

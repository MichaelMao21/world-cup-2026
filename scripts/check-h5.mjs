import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const html = await readFile(resolve("prototype.html"), "utf8");
const predictionService = await readFile(resolve("js/prediction-service.js"), "utf8");
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

if (!/createNewPkRoomFromMyPrediction[\s\S]*forceNew:\s*true/.test(html)) {
  throw new Error("New PK group flow must pass forceNew: true when creating a room");
}
if (!/if\s*\(\s*!payload\.forceNew\s*\)\s*\{[\s\S]*where\(\{\s*creator_id:\s*this\.userId,\s*match_id:\s*payload\.matchId\s*\}\)/.test(predictionService)) {
  throw new Error("CloudBase createRoom reuse must be guarded by !payload.forceNew");
}
if (!/syncWechatShareLink\(roomUrl,\s*matchText\)[\s\S]*waitForWechatShareCardReady\(\)/.test(html)) {
  throw new Error("PK room share flow must update WeChat card before opening share guidance");
}
if (html.includes("立即提交我的预测")) {
  throw new Error("PK room must not show the old immediate-submit prompt button");
}
if (html.includes('id="pk-room-submit-button"')) {
  throw new Error("PK room submit button should live inside the inline prediction form");
}
if (!/renderRoomPredictionEditor[\s\S]*submitRoomPrediction\(this\)/.test(html)) {
  throw new Error("Unsubmitted PK room state must show prediction options with an inline submit button");
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate element ids: ${[...new Set(duplicateIds)].join(", ")}`);

console.log(`Checked ${inlineScripts.length} inline script, ${ids.length} element ids and ${requiredIds.length} prediction UI contracts`);

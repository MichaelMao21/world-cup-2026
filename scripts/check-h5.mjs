import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const html = await readFile(resolve("prototype.html"), "utf8");
const predictionService = await readFile(resolve("js/prediction-service.js"), "utf8");
const buildScript = await readFile(resolve("scripts/build-h5.mjs"), "utf8");
const posterTemplateIndex = JSON.parse(await readFile(resolve("assets/poster-templates/index.json"), "utf8"));
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
const dedicatedSharePosters = [
  { matchId: "fifa-match-400021532", file: "brazil-vs-norway-share-poster.png", label: "Brazil vs Norway" },
  { matchId: "fifa-match-400021531", file: "england-vs-mexico-share-poster.png", label: "England vs Mexico" },
  { matchId: "fifa-match-400021529", file: "portugal-vs-spain-share-poster.png", label: "Portugal vs Spain" },
  { matchId: "fifa-match-400021534", file: "usa-vs-belgium-share-poster.png", label: "USA vs Belgium" },
];
for (const poster of dedicatedSharePosters) {
  const pattern = new RegExp(`${poster.matchId}[\\s\\S]*${poster.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  if (!pattern.test(html)) {
    throw new Error(`${poster.label} share poster must use the dedicated uploaded template`);
  }
  await access(resolve(`assets/match-posters/${poster.file}`)).catch(() => {
    throw new Error(`Missing ${poster.label} share poster asset`);
  });
}
if (!/drawMatchSpecificSharePoster[\s\S]*api\.qrserver\.com[\s\S]*shareUrl/.test(html)) {
  throw new Error("Match-specific share poster must render a room-specific QR code");
}
if (!/assets\/match-posters/.test(buildScript)) {
  throw new Error("H5 build must copy match-specific poster assets");
}
const brazilNorwayResultPoster = posterTemplateIndex.find((item) => item.dir === "20260706-brazil-vs-norway");
if (!brazilNorwayResultPoster) {
  throw new Error("Brazil vs Norway result poster template set is required");
}
if (brazilNorwayResultPoster.matchId !== "fifa-match-400021532") {
  throw new Error("Brazil vs Norway result poster must bind to fifa-match-400021532");
}
if (!brazilNorwayResultPoster.zeroHitTemplate) {
  throw new Error("Brazil vs Norway result poster must define a zero-hit template");
}
await access(resolve(`assets/poster-templates/${brazilNorwayResultPoster.dir}/${brazilNorwayResultPoster.zeroHitTemplate}`)).catch(() => {
  throw new Error("Missing Brazil vs Norway zero-hit result poster template");
});
for (const template of brazilNorwayResultPoster.templates || []) {
  await access(resolve(`assets/poster-templates/${brazilNorwayResultPoster.dir}/${template.file}`)).catch(() => {
    throw new Error(`Missing Brazil vs Norway result poster template ${template.file}`);
  });
}
if (!/norway-result-popart/.test(html) || !/drawNorwayResultPosterText/.test(html)) {
  throw new Error("Brazil vs Norway result poster must write hit predictions into the white card area");
}
const norwayPosterWriterMatch = html.match(/async function drawNorwayResultPosterText[\s\S]*?\n    }\n\n    async function tryDrawTemplateProphecyPoster/);
if (!norwayPosterWriterMatch) {
  throw new Error("Brazil vs Norway result poster writer must be isolated");
}
const norwayPosterWriter = norwayPosterWriterMatch[0];
if (/payload\.nickname|payload\.headline|fillText\("✓"/.test(norwayPosterWriter)) {
  throw new Error("Brazil vs Norway result poster must not overlay generic headline or font-dependent check text");
}
if (!/posterComicFontStack/.test(html) || !/drawPosterComicText/.test(html) || !/Impact/.test(html)) {
  throw new Error("Result poster hit text must use a comic poster typography helper");
}
if (!/const headerY = 724 \* scale;[\s\S]*const rowStartY = 798 \* scale;/.test(norwayPosterWriter)) {
  throw new Error("Brazil vs Norway hit predictions must be shifted lower inside the white card");
}
if (!/drawPosterComicText\(ctx, hitText/.test(norwayPosterWriter) || !/drawPosterComicText\(ctx, text/.test(norwayPosterWriter)) {
  throw new Error("Brazil vs Norway hit predictions must use the comic poster text style");
}
if (!/async function drawNorwayResultPosterQr[\s\S]*coverX[\s\S]*coverY[\s\S]*api\.qrserver\.com[\s\S]*encodeURIComponent\(_SHARE_URL\)/.test(html)) {
  throw new Error("Brazil vs Norway result poster must replace the template QR with a generated fixed-homepage QR");
}
if (!/const qrOffsetY = 18 \* scale[\s\S]*coverY \+ pad \+ qrOffsetY/.test(html)) {
  throw new Error("Brazil vs Norway generated QR must be shifted downward inside the old QR cover area");
}
if (!/drawNorwayResultPosterText[\s\S]*drawNorwayResultPosterQr\(ctx\)/.test(html)) {
  throw new Error("Brazil vs Norway hit poster must cover the old QR after writing hit predictions");
}
if (!/function drawResultPosterQr[\s\S]*norway-result-popart[\s\S]*drawNorwayResultPosterQr\(ctx\)/.test(html)) {
  throw new Error("Template prophecy poster must choose the Brazil vs Norway QR overlay by poster style");
}
if (!/\(payload\.hits\s*\|\|\s*0\)\s*<=\s*0[\s\S]*zeroHitTemplate[\s\S]*drawResultPosterQr\(ctx,\s*resultPosterStyle\(templateSet\)\)/.test(html)) {
  throw new Error("Brazil vs Norway zero-hit poster must route QR overlay through the template style");
}
if (!/payload\.hits\s*\|\|\s*0\)\s*<=\s*0[\s\S]*zeroHitTemplate/.test(html)) {
  throw new Error("Zero-hit prophecy poster must use the dedicated zero-hit template");
}

const englandMexicoResultPoster = posterTemplateIndex.find((item) => item.dir === "20260706-england-vs-mexico");
if (!englandMexicoResultPoster) {
  throw new Error("England vs Mexico result poster template set is required");
}
if (englandMexicoResultPoster.matchId !== "fifa-match-400021531") {
  throw new Error("England vs Mexico result poster must bind to fifa-match-400021531");
}
if (!englandMexicoResultPoster.zeroHitTemplate) {
  throw new Error("England vs Mexico result poster must define a zero-hit template");
}
await access(resolve(`assets/poster-templates/${englandMexicoResultPoster.dir}/${englandMexicoResultPoster.zeroHitTemplate}`)).catch(() => {
  throw new Error("Missing England vs Mexico zero-hit result poster template");
});
for (const template of englandMexicoResultPoster.templates || []) {
  await access(resolve(`assets/poster-templates/${englandMexicoResultPoster.dir}/${template.file}`)).catch(() => {
    throw new Error(`Missing England vs Mexico result poster template ${template.file}`);
  });
}
if (!/england-result-popart/.test(html) || !/drawEnglandResultPosterText/.test(html)) {
  throw new Error("England vs Mexico result poster must write hit predictions into the white card area");
}
const englandPosterWriterMatch = html.match(/async function drawEnglandResultPosterText[\s\S]*?\n    }\n\n    function resultPosterStyle/);
if (!englandPosterWriterMatch) {
  throw new Error("England vs Mexico result poster writer must be isolated");
}
const englandPosterWriter = englandPosterWriterMatch[0];
if (/payload\.nickname|payload\.headline|fillText\("✓"/.test(englandPosterWriter)) {
  throw new Error("England vs Mexico result poster must not overlay generic headline or font-dependent check text");
}
if (!/const headerY = 704 \* scale;[\s\S]*const rowStartY = 786 \* scale;/.test(englandPosterWriter)) {
  throw new Error("England vs Mexico hit predictions must be shifted lower inside the white card");
}
if (!/drawPosterComicText\(ctx, hitText/.test(englandPosterWriter) || !/drawPosterComicText\(ctx, text/.test(englandPosterWriter)) {
  throw new Error("England vs Mexico hit predictions must use the comic poster text style");
}
if (!/async function drawEnglandResultPosterQr[\s\S]*coverX[\s\S]*coverY[\s\S]*api\.qrserver\.com[\s\S]*encodeURIComponent\(_SHARE_URL\)/.test(html)) {
  throw new Error("England vs Mexico result poster must replace the template QR box with a generated fixed-homepage QR");
}
if (!/drawEnglandResultPosterText[\s\S]*drawEnglandResultPosterQr\(ctx\)/.test(html)) {
  throw new Error("England vs Mexico hit poster must cover the QR box after writing hit predictions");
}
if (!/function resultPosterStyle[\s\S]*function drawResultPosterQr[\s\S]*england-result-popart[\s\S]*drawEnglandResultPosterQr\(ctx\)/.test(html)) {
  throw new Error("Template prophecy poster must choose the England QR overlay by poster style");
}
if (!/\(payload\.hits\s*\|\|\s*0\)\s*<=\s*0[\s\S]*zeroHitTemplate[\s\S]*drawResultPosterQr\(ctx,\s*resultPosterStyle\(templateSet\)\)/.test(html)) {
  throw new Error("Zero-hit result poster must route QR overlay through the template style");
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate element ids: ${[...new Set(duplicateIds)].join(", ")}`);

console.log(`Checked ${inlineScripts.length} inline script, ${ids.length} element ids and ${requiredIds.length} prediction UI contracts`);

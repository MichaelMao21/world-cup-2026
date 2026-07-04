import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const values = new Map();
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
const window = { localStorage, crypto: webcrypto };
window.window = window;
const source = await readFile("js/prediction-service.js", "utf8");
vm.runInNewContext(source, { window, console });

const creator = window.PredictionService.create({});
await creator.ensureProfile("阿峰");
const created = await creator.createRoom({
  matchId: "test-match",
  matchLabel: "荷兰 vs 瑞典",
  answers: { result: "荷兰胜" },
});
if (created.room.code && created.room.id !== created.room.code) {
  throw new Error("Room id should match share code for direct shared-link lookup");
}

localStorage.removeItem("world-cup-prediction-user-v1");
const guest = window.PredictionService.create({});
await guest.ensureProfile("小王");
await guest.joinRoom(created.room.id);
await guest.savePrediction(created.room.id, { result: "平局" });

const room = await creator.getRoom(created.room.id);
const leaderboard = await guest.getLeaderboard();
if (room.members.length !== 2) throw new Error("Expected two room members");
if (leaderboard.length !== 2) throw new Error("Expected two leaderboard entries");
if (!room.prediction?.answers) throw new Error("Creator prediction was not persisted");
if (!room.predictions?.some((item) => item.answers?.result === "荷兰胜")) throw new Error("Creator prediction was not visible in room");

localStorage.removeItem("world-cup-prediction-user-v1");
const secondGuest = window.PredictionService.create({});
await secondGuest.ensureProfile("小李");
const codeRoom = await secondGuest.joinRoom(created.room.code);
if (codeRoom.room.id !== created.room.id) throw new Error("Shared room code did not resolve to original room");

values.clear();
const nicknameOwner = window.PredictionService.create({});
await nicknameOwner.ensureProfile("剑桥");
await nicknameOwner.updateNickname("阿峰");
const ownerProfile = await nicknameOwner.getProfile();
if (ownerProfile.nickname !== "阿峰") throw new Error("Nickname update should overwrite the old nickname");

localStorage.removeItem("world-cup-prediction-user-v1");
const nicknameGuest = window.PredictionService.create({});
let duplicateRejected = false;
try {
  await nicknameGuest.ensureProfile("阿峰");
} catch (error) {
  duplicateRejected = error?.code === "NICKNAME_TAKEN";
}
if (!duplicateRejected) throw new Error("Duplicate nickname should be rejected");

const suggestedNickname = await nicknameGuest.generateAvailableNickname("阿峰");
if (!suggestedNickname || suggestedNickname === "阿峰") throw new Error("Generated nickname should avoid existing nickname");
await nicknameGuest.ensureProfile(suggestedNickname);

await nicknameOwner.updateNickname("老王");
await nicknameGuest.updateNickname("阿峰");
const guestProfile = await nicknameGuest.getProfile();
if (guestProfile.nickname !== "阿峰") throw new Error("Old nickname should be reusable after owner changes it");

console.log(`Prediction flow passed: ${room.members.map((member) => member.nickname).join(", ")}`);

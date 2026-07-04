import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile("/Users/maozhan/Documents/VB-世界杯观赛指南/data/fifa-matches.json", "utf8"));
const scheduled = data.matches.filter(m => m.status === "scheduled");
const monthNames = {January:1,February:2,March:3,April:4,May:5,June:6,July:7};

const byDate = {};
scheduled.forEach(m => {
  if (!byDate[m.dateText]) byDate[m.dateText] = [];
  byDate[m.dateText].push(m);
});

const dates = Object.keys(byDate).sort((a,b) => {
  const pa = a.split(" "), pb = b.split(" ");
  return new Date(pa[3], monthNames[pa[2]]-1, pa[1]) - new Date(pb[3], monthNames[pb[2]]-1, pb[1]);
});

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
let output = "# World Cup 2026 match polling (system crontab)\n";
output += "# Poll script runs every 5 min for 2.5h and auto-publishes\n\n";

for (const dateText of dates) {
  const matches = byDate[dateText];
  let latestMin = 0;
  matches.forEach(m => {
    if (m.time) {
      const [h, mn] = m.time.split(":").map(Number);
      if (h * 60 + mn > latestMin) latestMin = h * 60 + mn;
    }
  });
  const endMin = latestMin + 120; // kickoff + 2h
  const endH = Math.floor(endMin / 60);
  const endM = endMin % 60;
  const parts = dateText.split(" ");
  const dom = parts[1];
  const month = String(monthNames[parts[2]]);

  output += `# ${dateText} - ${matches.length} matches\n`;
  output += `${endM} ${endH} ${dom} ${month} * cd ${PROJECT} && bash scripts/poll-match-results.sh "${dateText}" >> ~/world-cup-cron.log 2>&1\n\n`;
}

console.log(output);

// Also print for appending to crontab
const fs = await import("node:fs/promises");
await fs.writeFile("/Users/maozhan/Documents/VB-世界杯观赛指南/world-cup-crontab.txt", output);
console.log("--- Saved to world-cup-crontab.txt ---");

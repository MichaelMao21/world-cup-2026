import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve("data/fifa-page-matches.json");
const outputPath = resolve("data/fifa-matches.json");
const teamData = JSON.parse(await readFile(resolve("data/fifa-teams-raw.json"), "utf8"));
const rawMatches = JSON.parse(await readFile(inputPath, "utf8"));

const teamNames = teamData.teams.map((team) => team.name === "Kroatien" ? "Croatia" : team.name);
const placeholders = [
  "1A", "1B", "1C", "1D", "1E", "1F", "1G", "1H", "1I", "1J", "1K", "1L",
  "2A", "2B", "2C", "2D", "2E", "2F", "2G", "2H", "2I", "2J", "2K", "2L",
  "W73", "W74", "W75", "W76", "W77", "W78", "W79", "W80", "W81", "W82",
  "W83", "W84", "W85", "W86", "W87", "W88", "W89", "W90", "W91", "W92",
  "W93", "W94", "W95", "W96", "W97", "W98", "W99", "W100", "W101", "W102",
  "RU101", "RU102", "3ABCDF", "3CDFGH", "3CEFHI", "3EHIJK", "3AEHIJ", "3BEFIJ",
  "3EFGIJ", "3DEIJL",
];
const competitors = [...teamNames, ...placeholders].sort((a, b) => b.length - a.length);

const matches = rawMatches.map(normalizeMatch).filter(Boolean);
const venues = buildVenues(matches);

const payload = {
  source: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures",
  importedAt: new Date().toISOString(),
  timezone: "Asia/Shanghai",
  counts: {
    matches: matches.length,
    completed: matches.filter((match) => match.status === "completed").length,
    scheduled: matches.filter((match) => match.status === "scheduled").length,
    venues: venues.length,
  },
  matches,
  venues,
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Saved ${payload.counts.matches} matches and ${payload.counts.venues} venues to ${outputPath}`);

function normalizeMatch(raw) {
  const marker = raw.text.match(/\s(First Stage|Round of 32|Round of 16|Quarter-final|Semi-final|Play-off for third place|Final)\s·\s/);
  if (!marker) return null;

  const competitionText = raw.text.slice(0, marker.index).trim();
  const details = raw.text.slice(marker.index + 1).split(" · ");
  const stage = details[0] || "";
  const group = details.length === 3 ? details[1] : "";
  const venueText = details.at(-1) || "";
  const venueMatch = venueText.match(/^(.*?)\s+\((.*?)\)$/);
  const homeTeam = competitors.find((name) => competitionText.startsWith(`${name} `));
  if (!homeTeam) return null;

  const remainder = competitionText.slice(homeTeam.length + 1);
  const completed = remainder.match(/^(\d+)\s+FT\s+(\d+)\s+(.+)$/);
  const scheduled = remainder.match(/^(\d{2}:\d{2})\s+(.+)$/);
  if (!completed && !scheduled) return null;

  const id = raw.href.split("/").filter(Boolean).at(-1);

  return {
    id: `fifa-match-${id}`,
    fifaMatchId: id,
    sourceUrl: raw.href,
    dateText: raw.date || "",
    time: scheduled?.[1] || "",
    status: completed ? "completed" : "scheduled",
    homeTeam,
    awayTeam: completed?.[3] || scheduled?.[2] || "",
    homeScore: completed ? Number(completed[1]) : null,
    awayScore: completed ? Number(completed[2]) : null,
    stage,
    group,
    venue: venueMatch?.[1] || venueText,
    city: venueMatch?.[2] || "",
  };
}

function buildVenues(matchList) {
  const venues = new Map();

  for (const match of matchList) {
    const key = `${match.venue}|${match.city}`;
    if (!venues.has(key)) {
      venues.set(key, {
        id: `venue-${slugify(match.venue)}`,
        name: match.venue,
        city: match.city,
        matchIds: [],
      });
    }
    venues.get(key).matchIds.push(match.id);
  }

  return [...venues.values()].map((venue) => ({
    ...venue,
    matchCount: venue.matchIds.length,
  }));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve("data/fifa-teams-raw.json");
const outputPath = resolve("data/prototype-data.js");
const fifaData = JSON.parse(await readFile(inputPath, "utf8"));
const matchData = JSON.parse(await readFile(resolve("data/fifa-matches.json"), "utf8"));
const insightData = JSON.parse(await readFile(resolve("data/fifa-insights.json"), "utf8"));
const playerStats = await readOptionalJson(resolve("data/player-stats.json"), null);
const previewData = await readOptionalJson(resolve("data/match-previews.json"), {});
const standings = buildStandings(matchData.matches || [], insightData.standings || []);

const payload = {
  generatedAt: new Date().toISOString(),
  teams: fifaData.teams,
  players: fifaData.players,
  matches: matchData.matches,
  venues: matchData.venues,
  standings,
  teamStats: insightData.teamStats || { rows: [] },
  powerRankings: insightData.powerRankings,
  tournamentStats: insightData.tournamentStats,
  playerStats,
  matchPreviews: previewData.previews || {},
};

await writeFile(
  outputPath,
  `window.PROTOTYPE_DATA = ${JSON.stringify(payload, null, 2)};\n`,
  "utf8",
);

console.log(
  `Saved ${payload.teams.length} teams, ${payload.players.length} players, ${payload.matches.length} matches and ${payload.venues.length} venues to ${outputPath}`,
);

function buildStandings(matches, fallbackStandings) {
  const fallbackByGroup = new Map((fallbackStandings || []).map((group) => [group.group, group]));
  const groups = new Map();
  matches
    .filter((match) => match.status === "completed" && /^Group [A-L]$/.test(match.group || ""))
    .forEach((match) => {
      const group = match.group.replace("Group ", "");
      if (!groups.has(group)) groups.set(group, new Map());
      const table = groups.get(group);
      const home = getTeamRow(table, match.homeTeam);
      const away = getTeamRow(table, match.awayTeam);
      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;

      home.played += 1;
      away.played += 1;
      home.gf += homeScore;
      home.ga += awayScore;
      away.gf += awayScore;
      away.ga += homeScore;

      if (homeScore > awayScore) {
        home.won += 1;
        away.lost += 1;
        home.points += 3;
      } else if (homeScore < awayScore) {
        away.won += 1;
        home.lost += 1;
        away.points += 3;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    });

  return [..."ABCDEFGHIJKL"].map((group) => {
    const computedRows = [...(groups.get(group)?.values() || [])].map((row) => ({
      ...row,
      gd: row.gf - row.ga,
    }));
    const fallbackRows = fallbackByGroup.get(group)?.rows || [];
    const rowsByTeam = new Map(computedRows.map((row) => [row.team, row]));
    fallbackRows.forEach((row) => {
      if (!rowsByTeam.has(row.team)) {
        rowsByTeam.set(row.team, {
          team: row.team,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          conductScore: row.conductScore || 0,
          points: 0,
        });
      }
    });
    const rows = [...rowsByTeam.values()]
      .sort((a, b) => (
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.team.localeCompare(b.team)
      ))
      .map((row, index) => ({
        ...row,
        rank: index + 1,
      }));
    return { group, rows };
  });
}

async function readOptionalJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function getTeamRow(table, team) {
  if (!table.has(team)) {
    table.set(team, {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      conductScore: 0,
      points: 0,
    });
  }
  return table.get(team);
}

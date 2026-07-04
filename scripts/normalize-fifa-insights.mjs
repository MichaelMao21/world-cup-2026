import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const standingsInspect = JSON.parse(
  await readFile(resolve("data/fifa-standings-inspect.json"), "utf8"),
);
const powerInspect = JSON.parse(
  await readFile(resolve("data/fifa-power-rankings-inspect.json"), "utf8"),
);
const matchData = JSON.parse(await readFile(resolve("data/fifa-matches.json"), "utf8"));

const standings = standingsInspect.tables.map(parseStandingsTable);
const topOutfield = parseOutfieldRankings(powerInspect.tables[0]?.text || "");
const leaders = parsePowerLeaders(powerInspect.mainText);
const tournamentStats = calculateTournamentStats(matchData.matches);

const payload = {
  sources: {
    standings: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings",
    powerRankings: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/power-rankings",
  },
  importedAt: new Date().toISOString(),
  standings,
  powerRankings: {
    leaders,
    topOutfield,
  },
  tournamentStats,
};

await writeFile(
  resolve("data/fifa-insights.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
  "utf8",
);

console.log(
  `Saved ${standings.length} groups and ${topOutfield.length} power-ranked players to data/fifa-insights.json`,
);

function parseStandingsTable(table) {
  const lines = table.text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const group = lines.find((line) => /^Group [A-L]$/.test(line))?.replace("Group ", "") || "";
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^[1-4]$/.test(lines[index])) continue;
    const rank = Number(lines[index]);
    const team = lines[index + 1];
    const stats = (lines[index + 2] || "").split("\t").map(Number);
    if (!team || stats.length < 9 || stats.some(Number.isNaN)) continue;

    rows.push({
      rank,
      team,
      played: stats[0],
      won: stats[1],
      drawn: stats[2],
      lost: stats[3],
      goalsFor: stats[4],
      goalsAgainst: stats[5],
      goalDifference: stats[6],
      conductScore: stats[7],
      points: stats[8],
    });
  }

  return { group, rows };
}

function parseOutfieldRankings(text) {
  const tokens = text.split(/\n/).map((line) => line.trim()).filter(Boolean).slice(5);
  const rows = [];
  let index = 0;

  while (index < tokens.length && rows.length < 10) {
    const rank = Number(tokens[index]);
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
      index += 1;
      continue;
    }
    index += 1;

    let movement = "";
    if (/^-?\d+$/.test(tokens[index] || "")) {
      movement = tokens[index];
      index += 1;
    }

    const player = tokens[index++];
    const team = tokens[index++];
    const attacking = Number(tokens[index++]);
    const creativity = Number(tokens[index++]);
    const defending = Number(tokens[index++]);

    if (!player || !team || [attacking, creativity, defending].some(Number.isNaN)) continue;
    rows.push({ rank, movement, player, team, attacking, creativity, defending });
  }

  return rows;
}

function parsePowerLeaders(text) {
  return ["Attacking", "Creativity", "Defending"].map((category) => {
    const pattern = new RegExp(
      `${category}\\n([^\\n]+)\\n1st\\n([^\\n]+)\\n([\\d.]+)\\n${category} score`,
      "i",
    );
    const match = text.match(pattern);
    return {
      category: category.toLowerCase(),
      team: match?.[1] || "",
      player: match?.[2] || "",
      score: match ? Number(match[3]) : null,
    };
  });
}

function calculateTournamentStats(matches) {
  const completed = matches.filter((match) => match.status === "completed");
  const totalGoals = completed.reduce(
    (sum, match) => sum + match.homeScore + match.awayScore,
    0,
  );
  const draws = completed.filter((match) => match.homeScore === match.awayScore).length;
  const cleanSheets = completed.reduce(
    (count, match) => count + Number(match.homeScore === 0) + Number(match.awayScore === 0),
    0,
  );
  const biggestWin = completed.reduce((current, match) => {
    const margin = Math.abs(match.homeScore - match.awayScore);
    return !current || margin > current.margin ? { ...match, margin } : current;
  }, null);
  const teamGoals = new Map();

  for (const match of completed) {
    teamGoals.set(match.homeTeam, (teamGoals.get(match.homeTeam) || 0) + match.homeScore);
    teamGoals.set(match.awayTeam, (teamGoals.get(match.awayTeam) || 0) + match.awayScore);
  }

  const topScoringTeam = [...teamGoals.entries()]
    .map(([team, goals]) => ({ team, goals }))
    .sort((a, b) => b.goals - a.goals)[0] || null;

  return {
    completedMatches: completed.length,
    totalGoals,
    goalsPerMatch: completed.length ? Number((totalGoals / completed.length).toFixed(2)) : 0,
    draws,
    cleanSheets,
    topScoringTeam,
    biggestWin: biggestWin ? {
      homeTeam: biggestWin.homeTeam,
      awayTeam: biggestWin.awayTeam,
      homeScore: biggestWin.homeScore,
      awayScore: biggestWin.awayScore,
      margin: biggestWin.margin,
    } : null,
  };
}

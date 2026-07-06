import { readFile, writeFile } from "node:fs/promises";

// Recalculate tournament stats + standings + power rankings from match data only.
// Does NOT depend on Chrome or FIFA scraping — pure local computation.

const MATCHES = "/Users/maozhan/Documents/VB-世界杯观赛指南/data/fifa-matches.json";
const INSIGHTS = "/Users/maozhan/Documents/VB-世界杯观赛指南/data/fifa-insights.json";

const matches = JSON.parse(await readFile(MATCHES, "utf8"));
const oldInsights = JSON.parse(await readFile(INSIGHTS, "utf8"));

// Group stage only — used for standings
const completed = matches.matches.filter((m) => m.status === "completed" && m.stage === "First Stage");
// All completed matches — used for tournament stats
const allCompleted = matches.matches.filter((m) => m.status === "completed");

// ── Tournament Stats ──
let totalGoals = 0;
let draws = 0;
let cleanSheets = 0;
let biggestWin = null;
const teamGoals = {};
const teamRows = {};

for (const m of allCompleted) {
  const hg = m.homeScore ?? 0;
  const ag = m.awayScore ?? 0;
  totalGoals += hg + ag;
  if (hg === ag) draws++;
  if (hg === 0 || ag === 0) cleanSheets++;

  teamGoals[m.homeTeam] = (teamGoals[m.homeTeam] || 0) + hg;
  teamGoals[m.awayTeam] = (teamGoals[m.awayTeam] || 0) + ag;
  const home = getTeamRow(teamRows, m.homeTeam);
  const away = getTeamRow(teamRows, m.awayTeam);
  home.played += 1;
  away.played += 1;
  home.goalsFor += hg;
  home.goalsAgainst += ag;
  away.goalsFor += ag;
  away.goalsAgainst += hg;
  if (hg > ag) {
    home.won += 1;
    away.lost += 1;
  } else if (hg < ag) {
    away.won += 1;
    home.lost += 1;
  } else {
    home.drawn += 1;
    away.drawn += 1;
  }

  const margin = Math.abs(hg - ag);
  if (!biggestWin || margin > biggestWin.margin) {
    biggestWin = { homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore: hg, awayScore: ag, margin };
  }
}

let topScoring = { team: "", goals: 0 };
for (const [team, goals] of Object.entries(teamGoals)) {
  if (goals > topScoring.goals) topScoring = { team, goals };
}

const tournamentStats = {
  completedMatches: allCompleted.length,
  totalGoals,
  goalsPerMatch: allCompleted.length ? +(totalGoals / allCompleted.length).toFixed(1) : 0,
  draws,
  cleanSheets,
  topScoringTeam: topScoring,
  biggestWin,
};

const teamStats = {
  source: "calculated from fifa-matches.json",
  rows: Object.values(teamRows)
    .map((team) => ({
      ...team,
      goalDifference: team.goalsFor - team.goalsAgainst,
      points: team.won * 3 + team.drawn,
      cleanSheets: team.cleanSheets || 0
    }))
    .sort((a, b) => b.goalsFor - a.goalsFor || b.goalDifference - a.goalDifference || a.team.localeCompare(b.team))
};

// ── Group Standings ──
// Get all teams that participated in matches
const allTeams = new Set();
const groupMap = {};
for (const m of completed) {
  allTeams.add(m.homeTeam);
  allTeams.add(m.awayTeam);
  if (m.group && !groupMap[m.homeTeam]) groupMap[m.homeTeam] = m.group.replace("Group ", "");
  if (m.group && !groupMap[m.awayTeam]) groupMap[m.awayTeam] = m.group.replace("Group ", "");
}

// Build standings per group
const groups = {};
for (const t of allTeams) {
  const g = groupMap[t] || "?";
  if (!groups[g]) groups[g] = {};
  groups[g][t] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
}

for (const m of completed) {
  const g = m.group?.replace("Group ", "") || "?";
  const h = groups[g]?.[m.homeTeam];
  const a = groups[g]?.[m.awayTeam];
  if (h && a) {
    h.played++; a.played++;
    h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) { h.won++; a.lost++; }
    else if (m.homeScore < m.awayScore) { a.won++; h.lost++; }
    else { h.drawn++; a.drawn++; }
  }
}

const standings = Object.entries(groups).map(([group, teams]) => {
  const rows = Object.values(teams)
    .map((t) => ({
      ...t,
      goalDifference: t.goalsFor - t.goalsAgainst,
      points: t.won * 3 + t.drawn,
    }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  rows.forEach((r, i) => { r.rank = i + 1; });

  // Add conduct score (placeholder — not available from match data alone)
  rows.forEach((r) => { r.conductScore = 0; });
  return { group, rows };
});

// ── Power Rankings (preserve old data since FIFA computes this) ──
const powerRankings = oldInsights.powerRankings || { leaders: [], topOutfield: [] };

const insights = {
  source: "calculated from fifa-matches.json",
  generatedAt: new Date().toISOString(),
  tournamentStats,
  teamStats,
  standings,
  powerRankings,
};

await writeFile(INSIGHTS, JSON.stringify(insights, null, 2), "utf8");
console.log(`Insights recalculated: ${standings.length} groups, ${allCompleted.length} completed (${completed.length} group stage + ${allCompleted.length - completed.length} knockout), ${totalGoals} goals`);
console.log(`Standings: ${standings.map((g) => g.group + "(" + g.rows.length + " teams)").join(", ")}`);

function getTeamRow(rows, team) {
  if (!rows[team]) {
    rows[team] = {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };
  }
  return rows[team];
}

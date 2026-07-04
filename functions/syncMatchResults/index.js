const cloudbase = require("@cloudbase/node-sdk");
const https = require("https");
const seed = require("./matches-seed.json");

const ENV_ID = process.env.CLOUDBASE_ENV_ID || "worldcup2026-d7gfmdarw394a4109";
const FIFA_API_URLS = [
  "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=17&idSeason=285023"
];

let app;

exports.main = async function main(event = {}, context = {}) {
  const startedAt = new Date();
  const db = getDb();
  const seedMatches = seed.matches || [];
  const remoteResult = await fetchRemoteMatches(seedMatches);
  const remoteMatches = remoteResult.matches;
  const shouldUseRemote = remoteMatches.length > 0;
  const mergedMatches = shouldUseRemote ? mergeMatches(seedMatches, remoteMatches) : seedMatches.map((match) => toDbMatch(match, "seed-fallback"));
  const dueMatches = mergedMatches.filter(isDueForResultCheck);
  const seedResult = shouldUseRemote ? await upsertMatches(db, mergedMatches) : { inserted: 0, updated: 0 };
  const log = {
    type: "match_result_sync",
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    trigger_event: event,
    function_context: {
      requestId: context.requestId || context.request_id || "",
      functionName: context.functionName || context.function_name || "syncMatchResults"
    },
    counts: {
      seed: seedMatches.length,
      remote: remoteMatches.length,
      merged: mergedMatches.length,
      due: dueMatches.length,
      inserted: seedResult.inserted,
      updated: seedResult.updated,
      completed: mergedMatches.filter((match) => match.status === "completed").length,
      scheduled: mergedMatches.filter((match) => match.status !== "completed").length
    },
    errors: remoteResult.errors
  };
  await writeSyncLog(db, log);
  return log;
};

function getDb() {
  if (!app) {
    app = cloudbase.init({ env: ENV_ID });
  }
  return app.database();
}

async function fetchRemoteMatches(seedMatches) {
  const matches = [];
  const errors = [];
  for (const url of FIFA_API_URLS) {
    try {
      const data = await fetchJson(url);
      const normalized = normalizeFifaApiMatches(data.Results || [], seedMatches);
      matches.push(...normalized);
    } catch (error) {
      errors.push({ url, message: error.message || String(error), cause: error.cause?.message || "" });
    }
  }
  return { matches: dedupeMatches(matches), errors };
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "WorldCupWatchGuide/1.0 CloudBase sync"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    return httpsGetJson(url);
  }
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      family: 4,
      timeout: 15000,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "WorldCupWatchGuide/1.0 CloudBase sync"
      }
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("HTTPS request timed out"));
    });
    request.on("error", reject);
  });
}

function normalizeFifaApiMatches(rawMatches, seedMatches) {
  const knownIds = new Set(seedMatches.map((match) => String(match.fifaMatchId || "").trim()).filter(Boolean));
  return rawMatches.map((raw) => {
    const fifaMatchId = String(raw.IdMatch || raw.idMatch || raw.MatchId || "").trim();
    if (!knownIds.has(fifaMatchId)) return null;
    const homeScore = numberOrNull(raw.Home?.Score ?? raw.HomeTeam?.Score ?? raw.homeScore);
    const awayScore = numberOrNull(raw.Away?.Score ?? raw.AwayTeam?.Score ?? raw.awayScore);
    const completed = isFifaMatchCompleted(raw, homeScore, awayScore);
    return {
      fifaMatchId,
      status: completed ? "completed" : "scheduled",
      homeScore,
      awayScore,
      source: "fifa-api",
      syncedAt: new Date().toISOString()
    };
  }).filter(Boolean);
}

function isFifaMatchCompleted(raw, homeScore, awayScore) {
  if (homeScore == null || awayScore == null) return false;
  if (raw.MatchStatus === 0 || raw.matchStatus === 0) return true;

  const kickoff = raw.Date ? new Date(raw.Date) : null;
  if (kickoff && !Number.isNaN(kickoff.getTime())) {
    return Date.now() >= kickoff.getTime() + 120 * 60 * 1000;
  }
  return false;
}

function mergeMatches(seedMatches, remoteMatches) {
  const remoteById = new Map(remoteMatches.map((match) => [String(match.fifaMatchId), match]));
  return seedMatches.map((seedMatch) => {
    const remote = remoteById.get(String(seedMatch.fifaMatchId));
    if (!remote) return toDbMatch(seedMatch, "seed");
    return toDbMatch({
      ...seedMatch,
      status: remote.status || seedMatch.status,
      homeScore: remote.homeScore,
      awayScore: remote.awayScore
    }, remote.source || "remote");
  });
}

function toDbMatch(match, syncSource) {
  return {
    match_id: match.id,
    fifa_match_id: String(match.fifaMatchId || ""),
    source_url: match.sourceUrl || "",
    date_text: match.dateText || "",
    time: match.time || "",
    status: match.status || "scheduled",
    home_team: match.homeTeam || "",
    away_team: match.awayTeam || "",
    home_score: numberOrNull(match.homeScore),
    away_score: numberOrNull(match.awayScore),
    stage: match.stage || "",
    group: match.group || "",
    venue: match.venue || "",
    city: match.city || "",
    sync_source: syncSource,
    updated_at: new Date().toISOString()
  };
}

function isDueForResultCheck(match) {
  if (match.status === "completed") return false;
  const kickoff = parseBeijingKickoff(match.date_text, match.time);
  if (!kickoff) return false;
  return Date.now() >= kickoff.getTime() + 120 * 60 * 1000;
}

function parseBeijingKickoff(dateText, timeText) {
  if (!dateText || !timeText) return null;
  const months = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11
  };
  const parts = String(dateText).split(/\s+/);
  const day = Number(parts[1]);
  const month = months[parts[2]];
  const year = Number(parts[3]);
  const [hour, minute] = String(timeText).split(":").map(Number);
  if (!year || month == null || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return new Date(Date.UTC(year, month, day, hour - 8, minute));
}

async function upsertMatches(db, matches) {
  let inserted = 0;
  let updated = 0;
  for (const match of matches) {
    const collection = db.collection("matches");
    const existing = await collection.where({ match_id: match.match_id }).limit(1).get();
    const current = existing.data && existing.data[0];
    if (current && current._id) {
      await collection.doc(current._id).update(match);
      updated += 1;
    } else {
      await collection.add({ ...match, created_at: new Date().toISOString() });
      inserted += 1;
    }
  }
  return { inserted, updated };
}

async function writeSyncLog(db, log) {
  try {
    await db.collection("sync_logs").add(log);
  } catch (error) {
    // Logs are useful but should not fail the sync.
  }
}

function dedupeMatches(matches) {
  const byId = new Map();
  matches.forEach((match) => {
    if (match.fifaMatchId) byId.set(String(match.fifaMatchId), match);
  });
  return [...byId.values()];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

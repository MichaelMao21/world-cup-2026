import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const project = resolve(".");
const warnings = [];
const failures = [];

const matchDataPath = resolve(project, "data/fifa-matches.json");
const prototypeDataPath = resolve(project, "data/prototype-data.js");
const insightsPath = resolve(project, "data/fifa-insights.json");
const playerStatsPath = resolve(project, "data/player-stats.json");

let matchData;
try {
  matchData = JSON.parse(await readFile(matchDataPath, "utf8"));
} catch (error) {
  fail(`无法读取 data/fifa-matches.json: ${error.message}`);
}

if (matchData) {
  const matches = Array.isArray(matchData.matches) ? matchData.matches : [];
  const counts = matchData.counts || {};

  if (matches.length === 0) fail("比赛数据为空");
  if (Number(counts.matches) !== matches.length) {
    warn(`counts.matches 与实际比赛数不一致: ${counts.matches || 0} / ${matches.length}`);
  }

  const completed = matches.filter((match) => match.status === "completed");
  const scheduled = matches.filter((match) => match.status === "scheduled");
  const unknownStatus = matches.filter((match) => !["completed", "scheduled"].includes(match.status));
  const missingTeams = matches.filter((match) => !clean(match.homeTeam) || !clean(match.awayTeam));
  const completedWithoutScore = completed.filter((match) => !hasScore(match.homeScore) || !hasScore(match.awayScore));
  const scheduledWithScore = scheduled.filter((match) => hasScore(match.homeScore) || hasScore(match.awayScore));
  // Placeholder names: "W86", "RU101", "winner|runner-up|tbd|待定" etc.
  const placeholderTeams = matches.filter((match) =>
    /winner|runner-up|third|tbd|待定/i.test(`${match.homeTeam} ${match.awayTeam}`) ||
    /^(W|RU)\d+$/.test(match.homeTeam) || /^(W|RU)\d+$/.test(match.awayTeam)
  );
  // Only flag placeholder as FAILURE if the prerequisite stage is fully completed
  // (otherwise it's expected — we can't know the teams yet)
  const STAGE_ORDER = ["Round of 32","Round of 16","Quarter-final","Semi-final","Play-off for third place","Final"];
  const byStage = {};
  for (const s of STAGE_ORDER) byStage[s] = matches.filter(m => m.stage === s);
  const overduePlaceholders = placeholderTeams.filter(m => {
    const idx = STAGE_ORDER.indexOf(m.stage);
    if (idx <= 0) return true; // Round of 32 placeholders are always a failure
    const prevStage = STAGE_ORDER[idx - 1];
    const prev = byStage[prevStage] || [];
    return prev.length > 0 && prev.every(pm => pm.status === "completed");
  });
  const pendingPlaceholders = placeholderTeams.filter(m => !overduePlaceholders.includes(m));

  // Bracket integrity: scheduled knockout matches must not contain eliminated teams
  const KNOCKOUT_STAGES = new Set(["Round of 32","Round of 16","Quarter-final","Semi-final","Play-off for third place","Final"]);
  const eliminated = new Set();
  const advanced = new Set();
  for (const m of completed) {
    if (!KNOCKOUT_STAGES.has(m.stage)) continue;
    const hs = Number(m.homeScore), as = Number(m.awayScore);
    // penalty shootout stored as draw (1-1) — use penaltyWinner if present
    if (hs === as) {
      if (m.penaltyWinner === "home") { advanced.add(m.homeTeam); eliminated.add(m.awayTeam); }
      else if (m.penaltyWinner === "away") { advanced.add(m.awayTeam); eliminated.add(m.homeTeam); }
      // else: unknown winner, skip
    } else if (hs > as) { advanced.add(m.homeTeam); eliminated.add(m.awayTeam); }
    else { advanced.add(m.awayTeam); eliminated.add(m.homeTeam); }
  }
  const staleKnockout = scheduled.filter(m =>
    KNOCKOUT_STAGES.has(m.stage) &&
    (eliminated.has(m.homeTeam) || eliminated.has(m.awayTeam))
  );

  if (missingTeams.length) fail(`${missingTeams.length} 场比赛缺少队名`);
  if (completedWithoutScore.length) fail(`${completedWithoutScore.length} 场已完赛比赛缺少比分`);
  if (scheduledWithScore.length) warn(`${scheduledWithScore.length} 场未开赛比赛已经带比分`);
  if (unknownStatus.length) warn(`${unknownStatus.length} 场比赛状态不是 completed/scheduled`);
  if (overduePlaceholders.length) fail(`${overduePlaceholders.length} 场赛程占位队名未更新（前一轮已全部结束）: ${overduePlaceholders.map(m=>`${m.homeTeam} vs ${m.awayTeam}`).join(", ")}`);
  if (pendingPlaceholders.length) warn(`${pendingPlaceholders.length} 场赛程待前一轮结束后更新队名: ${pendingPlaceholders.map(m=>`${m.stage} ${m.homeTeam} vs ${m.awayTeam}`).join(", ")}`);
  if (staleKnockout.length) fail(`${staleKnockout.length} 场淘汰赛对阵含已被淘汰队伍，赛程未更新: ${staleKnockout.map(m=>`${m.homeTeam} vs ${m.awayTeam}`).join(", ")}`);

  // Matches that kicked off 3+ hours ago but still "scheduled" — data not updated
  const overdueScheduled = scheduled.filter(m => {
    if (!m.time) return false;
    const kickoff = parseBeijingKickoff(m.dateText, m.time);
    return kickoff && Date.now() >= kickoff.getTime() + 3 * 60 * 60 * 1000;
  });
  if (overdueScheduled.length) {
    fail(`${overdueScheduled.length} 场比赛已开球超过3小时但状态仍为 scheduled（比赛结果未录入）: ${overdueScheduled.map(m=>`${m.homeTeam} vs ${m.awayTeam} ${m.time}`).join(", ")}`);
  }

  const todayText = formatBeijingDate(new Date());
  const todayMatches = matches.filter((match) => match.dateText === todayText);
  const nextMatches = matches
    .filter((match) => match.status !== "completed")
    .slice(0, 5)
    .map((match) => `${match.dateText || "日期待定"} ${match.time || "时间待定"} ${match.homeTeam || "待定"} vs ${match.awayTeam || "待定"}`);

  if (!todayMatches.length) warn(`今日无匹配赛程: ${todayText}`);

  await checkPrototypeData(matches.length);
  await checkInsightsData(matches);
  await checkPlayerStatsFreshness(matches);

  const dataStat = await stat(matchDataPath);
  const summary = {
    checkedAt: new Date().toISOString(),
    matchFileUpdatedAt: dataStat.mtime.toISOString(),
    counts: {
      total: matches.length,
      completed: completed.length,
      scheduled: scheduled.length,
      today: todayMatches.length
    },
    todayText,
    todayMatches: todayMatches.map((match) => ({
      time: match.time || "",
      homeTeam: match.homeTeam || "",
      awayTeam: match.awayTeam || "",
      status: match.status || "",
      score: hasScore(match.homeScore) && hasScore(match.awayScore) ? `${match.homeScore}-${match.awayScore}` : ""
    })),
    nextMatches
  };

  printResult(summary);
}

if (failures.length) process.exit(1);
if (warnings.length) process.exitCode = 2;

async function checkPrototypeData(expectedMatchCount) {
  try {
    const source = await readFile(prototypeDataPath, "utf8");
    const context = { window: {} };
    vm.runInNewContext(source, context);
    const payload = context.window.PROTOTYPE_DATA;
    if (!payload) fail("data/prototype-data.js 未暴露 window.PROTOTYPE_DATA");
    if (payload && Array.isArray(payload.matches) && payload.matches.length !== expectedMatchCount) {
      warn(`prototype-data 比赛数与 fifa-matches 不一致: ${payload.matches.length} / ${expectedMatchCount}`);
    }
  } catch (error) {
    fail(`无法校验 data/prototype-data.js: ${error.message}`);
  }
}

async function checkInsightsData(matches) {
  try {
    const insights = JSON.parse(await readFile(insightsPath, "utf8"));
    const completedCount = matches.filter((match) => match.status === "completed").length;
    const statsCount = Number(insights.tournamentStats?.completedMatches);
    if (!Number.isFinite(statsCount)) {
      warn("fifa-insights.json 缺少 tournamentStats.completedMatches");
    } else if (statsCount !== completedCount) {
      warn(`赛事统计已完赛场次与赛程数据不一致: ${statsCount} / ${completedCount}`);
    }
    if (!Array.isArray(insights.standings) || insights.standings.length === 0) {
      warn("fifa-insights.json 缺少积分榜数据");
    }
    if (!insights.teamStats || !Array.isArray(insights.teamStats.rows) || insights.teamStats.rows.length === 0) {
      warn("fifa-insights.json 缺少球队统计榜 teamStats.rows");
    }
  } catch (error) {
    warn(`无法校验 data/fifa-insights.json: ${error.message}`);
  }
}

async function checkPlayerStatsFreshness(matches) {
  try {
    const playerStats = JSON.parse(await readFile(playerStatsPath, "utf8"));
    if (!Array.isArray(playerStats.goldenBoot) || playerStats.goldenBoot.length === 0) {
      warn("player-stats.json 缺少射手榜 goldenBoot");
    }
    if (!Array.isArray(playerStats.distribution) || playerStats.distribution.length === 0) {
      warn("player-stats.json 缺少助攻榜 distribution");
    }
    const importedAt = playerStats.importedAt ? new Date(playerStats.importedAt) : null;
    const latestCompletedDate = latestCompletedMatchDate(matches);
    if (importedAt && latestCompletedDate && stripTime(importedAt) < stripTime(latestCompletedDate)) {
      warn(`球员榜单同步时间 ${formatIsoDate(importedAt)} 早于最新已完赛比赛日期 ${formatIsoDate(latestCompletedDate)}，射手榜/助攻榜可能未同步`);
    }
    const coverage = playerStats.coverage || {};
    for (const key of ["goalkeeping", "discipline"]) {
      if (String(coverage[key] || "").includes("not available")) {
        warn(`球员榜单 ${key} 当前数据源未覆盖，不能视为完整自动同步`);
      }
    }
    validateScorerAudit(playerStats);
  } catch (error) {
    warn(`无法校验 data/player-stats.json: ${error.message}`);
  }
}

function validateScorerAudit(playerStats) {
  const eventRows = playerStats.audit?.eventGoldenBoot;
  if (!Array.isArray(eventRows) || eventRows.length === 0) {
    fail("射手榜缺少逐场进球事件审计数据，无法确认总榜是否漏算");
    return;
  }
  const finalRows = new Map((playerStats.goldenBoot || []).map((row) => [playerKey(row.name, row.team), row]));
  const mismatches = [];
  for (const eventRow of eventRows) {
    const finalRow = finalRows.get(playerKey(eventRow.name, eventRow.team));
    if (!finalRow || Number(finalRow.goals || 0) < Number(eventRow.goals || 0)) {
      mismatches.push(`${eventRow.name} ${eventRow.team}: event=${eventRow.goals}, final=${finalRow?.goals ?? "missing"}`);
    }
  }
  if (mismatches.length) {
    fail(`射手榜与逐场进球事件不一致: ${mismatches.slice(0, 8).join("; ")}`);
  }
  const corrections = playerStats.audit?.scorerCorrections || [];
  if (corrections.length) {
    warn(`射手榜已根据逐场事件校准 ${corrections.length} 项: ${corrections.slice(0, 5).map((item) => `${item.name} ${item.sourceGoals}->${item.finalGoals}`).join(", ")}`);
  }
}

function printResult(summary) {
  const result = {
    ok: failures.length === 0,
    status: failures.length ? "failed" : warnings.length ? "warning" : "passed",
    warnings,
    failures,
    summary
  };
  console.log(JSON.stringify(result, null, 2));
}

function hasScore(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function clean(value) {
  return String(value || "").trim();
}

function warn(message) {
  warnings.push(message);
}

function fail(message) {
  failures.push(message);
}

function parseBeijingKickoff(dateText, timeText) {
  const months = { January:"01",February:"02",March:"03",April:"04",May:"05",June:"06",
    July:"07",August:"08",September:"09",October:"10",November:"11",December:"12" };
  const parts = String(dateText || "").split(/\s+/);
  if (parts.length < 4) return null;
  const day = parts[1].padStart(2, "0");
  const month = months[parts[2]];
  const year = parts[3];
  if (!month) return null;
  const [hh, mm] = String(timeText || "").split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(`${year}-${month}-${day}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00+08:00`);
}

function formatBeijingDate(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
}

function latestCompletedMatchDate(matches) {
  const dates = matches
    .filter((match) => match.status === "completed")
    .map((match) => parseDateText(match.dateText))
    .filter(Boolean)
    .sort((a, b) => b - a);
  return dates[0] || null;
}

function parseDateText(dateText) {
  if (!dateText) return null;
  const months = {
    January: 0,
    February: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
    July: 6,
    August: 7,
    September: 8,
    October: 9,
    November: 10,
    December: 11
  };
  const parts = String(dateText).trim().split(/\s+/);
  const day = Number(parts[1]);
  const month = months[parts[2]];
  const year = Number(parts[3]);
  if (!year || month === undefined || !Number.isFinite(day)) return null;
  return new Date(year, month, day);
}

function parseIsoLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function playerKey(name, team) {
  return `${norm(team)}:${norm(name)}`;
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

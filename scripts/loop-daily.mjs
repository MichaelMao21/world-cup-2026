import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const project = resolve(".");
const loopDir = resolve(project, ".loop");
const logsDir = resolve(loopDir, "logs");
const reportsDir = resolve(loopDir, "reports");
const config = await loadConfig();
const runStartedAt = new Date();
const stamp = formatStamp(runStartedAt);
const triggerLabel = getArg("--trigger") || process.env.LOOP_TRIGGER || "daily";
const externalWarnings = parseExternalWarnings();
const nodeBin = process.execPath;
const larkCliBin = process.env.LARK_CLI_BIN || "/Users/maozhan/.npm-global/bin/lark-cli";
const childPath = ["/opt/local/bin", "/Users/maozhan/.npm-global/bin", process.env.PATH || ""].filter(Boolean).join(":");

await mkdir(logsDir, { recursive: true });
await mkdir(reportsDir, { recursive: true });

const checks = [];
if (config.checks?.data !== false) checks.push({ id: "data", label: "数据质量", command: [nodeBin, "scripts/validate-data.mjs"], warningExitCodes: [2] });
if (config.checks?.matchDataAssets !== false) checks.push({ id: "matchDataAssets", label: "比赛数据资产", command: [nodeBin, "scripts/test-match-data-assets.mjs"] });
if (config.checks?.h5Contracts !== false) checks.push({ id: "h5", label: "页面契约", command: [nodeBin, "scripts/check-h5.mjs"] });
if (config.checks?.predictionFlow !== false) checks.push({ id: "prediction", label: "预测流程", command: [nodeBin, "scripts/test-prediction-service.mjs"] });
if (config.checks?.localBuild !== false) checks.push({ id: "build", label: "本地构建", command: [nodeBin, "scripts/build-h5.mjs"] });

const results = [];
if (config.safety?.autoUpdateData === true) {
  results.push(await runCheck({ id: "syncResults", label: "同步赛果", command: [nodeBin, "scripts/sync-espn-match-results.mjs"] }));
  results.push(await runCheck({ id: "syncPlayerStats", label: "同步球员榜单", command: [nodeBin, "scripts/sync-player-stats.mjs"] }));
  results.push(await runCheck({ id: "calcInsights", label: "重算球队统计", command: [nodeBin, "scripts/calc-insights.mjs"] }));
  if (process.env.ANTHROPIC_API_KEY) {
    results.push(await runCheck({ id: "genPreviews", label: "生成赛前前瞻", command: [nodeBin, "scripts/gen-match-previews.mjs"], warningExitCodes: [1] }));
  }
  results.push(await runCheck({ id: "buildPrototypeData", label: "重建网站数据包", command: [nodeBin, "scripts/build-prototype-data.mjs"] }));
}
if (config.safety?.autoPublish === true) {
  results.push(await runCheck({ id: "publishCloudbase", label: "发布到 CloudBase", command: [nodeBin, "scripts/push-cloudbase.mjs"] }));
}
for (const check of checks) {
  results.push(await runCheck(check));
}

const status = results.some((item) => item.status === "failed")
  ? "failed"
  : results.some((item) => item.status === "warning")
    ? "warning"
    : "passed";

const dataResult = parseDataResult(results.find((item) => item.id === "data")?.stdout || "");
const report = buildReport({ status, results, dataResult, startedAt: runStartedAt, finishedAt: new Date() });
const reportPath = resolve(reportsDir, `${stamp}.md`);
const logPath = resolve(logsDir, `${stamp}.json`);

await writeFile(reportPath, report, "utf8");
await writeFile(logPath, JSON.stringify({ status, startedAt: runStartedAt.toISOString(), finishedAt: new Date().toISOString(), results }, null, 2), "utf8");
await writeFile(resolve(loopDir, "STATE.md"), report, "utf8");

const shouldSend = config.lark?.enabled && (
  status === "passed" && config.lark.sendOnSuccess !== false ||
  status === "warning" && config.lark.sendOnWarning !== false ||
  status === "failed" && config.lark.sendOnFailure !== false
);

let lark = { skipped: true, reason: "未启用飞书推送" };
if (shouldSend) {
  lark = await sendLark(report, stamp);
}

const finalResult = { status, reportPath, logPath, lark };
console.log(JSON.stringify(finalResult, null, 2));
if (status === "failed") process.exit(1);
if (status === "warning") process.exitCode = 2;

async function runCheck(check) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(check.command[0], check.command.slice(1), {
      cwd: project,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 8,
      env: {
        ...process.env,
        PATH: childPath
      }
    });
    return {
      id: check.id,
      label: check.label,
      status: "passed",
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdout,
      stderr
    };
  } catch (error) {
    const exitCode = error.code ?? 1;
    const status = check.warningExitCodes?.includes(exitCode) ? "warning" : "failed";
    return {
      id: check.id,
      label: check.label,
      status,
      exitCode,
      durationMs: Date.now() - startedAt,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || ""
    };
  }
}

async function sendLark(markdown, idempotencyKey) {
  const lark = config.lark || {};
  const recipientFlag = lark.recipientType === "chat" ? "--chat-id" : "--user-id";
  if (!lark.recipientId) return { skipped: true, reason: "缺少飞书 recipientId" };

  try {
    const { stdout, stderr } = await execFileAsync(larkCliBin, [
      "im",
      "+messages-send",
      recipientFlag,
      lark.recipientId,
      "--markdown",
      markdown,
      "--as",
      lark.identity || "user",
      "--idempotency-key",
      `world-cup-l1-${idempotencyKey}`
    ], {
      cwd: project,
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 4,
      env: {
        ...process.env,
        PATH: childPath
      }
    });
    return { skipped: false, ok: true, stdout, stderr };
  } catch (error) {
    return {
      skipped: false,
      ok: false,
      exitCode: error.code ?? 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || ""
    };
  }
}

function buildReport({ status, results, dataResult, startedAt, finishedAt }) {
  const loopLevel = config.level || "L1";
  const title = status === "passed" ? `世界杯观赛指南 ${loopLevel} 巡检通过` : status === "warning" ? `世界杯观赛指南 ${loopLevel} 巡检有提醒` : `世界杯观赛指南 ${loopLevel} 巡检失败`;
  const statusText = status === "passed" ? "通过" : status === "warning" ? "有提醒" : "失败";
  const autoFixText = config.safety?.autoFix
    ? `自动修复已开启，范围: ${(config.safety?.autoFixScope || []).join("、") || "低风险数据和发布链路"}`
    : "观察模式，不自动修复";
  const publishText = config.safety?.autoPublish ? "自动发布已开启" : "不自动发布";
  const lines = [
    `# ${title}`,
    "",
    `- 状态: ${statusText}`,
    `- 触发: ${triggerLabel}`,
    `- 开始: ${formatBeijingTime(startedAt)}`,
    `- 结束: ${formatBeijingTime(finishedAt)}`,
    `- 安全级别: ${loopLevel} ${autoFixText}；${publishText}`,
    ""
  ];

  if (dataResult?.summary) {
    const summary = dataResult.summary;
    lines.push("## 数据概览", "");
    lines.push(`- 比赛总数: ${summary.counts.total}`);
    lines.push(`- 已完赛: ${summary.counts.completed}`);
    lines.push(`- 未完赛: ${summary.counts.scheduled}`);
    lines.push(`- 今日赛程: ${summary.counts.today} 场 (${summary.todayText})`);
    lines.push(`- 数据文件更新时间: ${formatBeijingTime(new Date(summary.matchFileUpdatedAt))}`);
    if (summary.todayMatches?.length) {
      lines.push("", "## 今日比赛", "");
      for (const match of summary.todayMatches.slice(0, 8)) {
        const score = match.score ? ` ${match.score}` : "";
        lines.push(`- ${match.time || "时间待定"} ${match.homeTeam} vs ${match.awayTeam}${score} (${match.status})`);
      }
    }
    if (summary.nextMatches?.length) {
      lines.push("", "## 近期待关注", "");
      for (const match of summary.nextMatches) lines.push(`- ${match}`);
    }
  }

  lines.push("", "## 检查结果", "");
  for (const result of results) {
    const mark = result.status === "passed" ? "通过" : result.status === "warning" ? "提醒" : "失败";
    lines.push(`- ${result.label}: ${mark} (${Math.round(result.durationMs / 1000)}s)`);
  }

  const warnings = [...(dataResult?.warnings || []), ...externalWarnings];
  const failures = [
    ...(dataResult?.failures || []),
    ...results.filter((item) => item.status === "failed" && item.id !== "data").map((item) => `${item.label}: ${firstLine(item.stderr || item.stdout)}`)
  ];

  if (warnings.length) {
    lines.push("", "## 提醒", "");
    for (const warning of warnings.slice(0, 10)) lines.push(`- ${warning}`);
  }

  if (failures.length) {
    lines.push("", "## 需要处理", "");
    for (const failure of failures.slice(0, 10)) lines.push(`- ${failure}`);
  }

  lines.push("", "## 下一步", "");
  if (status === "passed") {
    lines.push("- 暂无必需操作。");
  } else if (status === "warning") {
    lines.push(config.safety?.autoFix ? "- 已完成允许范围内的自动修复；剩余提醒需要人工确认是否影响展示。" : "- 检查提醒项是否影响当天展示；当前级别不会自动修改。");
  } else {
    lines.push(config.safety?.autoFix ? "- 自动修复未能处理该失败项，需要人工接管。" : "- 需要人工查看失败项；当前级别不会自动修复或发布。");
  }

  return lines.join("\n");
}

async function loadConfig() {
  const base = JSON.parse(await readFile(resolve(loopDir, "CONFIG.json"), "utf8"));
  try {
    const local = JSON.parse(await readFile(resolve(loopDir, "CONFIG.local.json"), "utf8"));
    return merge(base, local);
  } catch {
    return base;
  }
}

function merge(base, override) {
  const output = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    output[key] = value && typeof value === "object" && !Array.isArray(value)
      ? merge(base[key] || {}, value)
      : value;
  }
  return output;
}

function parseDataResult(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function parseExternalWarnings() {
  if (!process.env.LOOP_EXTRA_WARNINGS) return [];
  try {
    const parsed = JSON.parse(process.env.LOOP_EXTRA_WARNINGS);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [String(process.env.LOOP_EXTRA_WARNINGS)];
  }
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function firstLine(value) {
  return String(value || "").split("\n").find(Boolean) || "无详细错误";
}

function formatStamp(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}

function formatBeijingTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

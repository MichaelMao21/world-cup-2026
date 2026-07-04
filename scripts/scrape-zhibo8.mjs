import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_URL = "https://www.zhibo8.cc/";
const DEFAULT_OUTPUT = "data/zhibo8-worldcup-raw.json";
const USER_AGENT =
  "WorldCupWatchGuidePrototype/0.1 (+local manual content workflow; contact: owner)";

const args = parseArgs(process.argv.slice(2));
const sourceUrl = args.url || DEFAULT_URL;
const outputPath = resolve(args.output || DEFAULT_OUTPUT);
const keywordText = args.keywords || "世界杯,世俱杯,足球,小组赛,淘汰赛,决赛";
const keywords = keywordText
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

await assertRobotsAllowed(sourceUrl);

const html = await fetchText(sourceUrl);
const extracted = extractWorldCupData(html, sourceUrl, keywords);

const payload = {
  source: sourceUrl,
  scrapedAt: new Date().toISOString(),
  note: [
    "Only public factual candidates are extracted.",
    "Review manually before publishing.",
    "Zhibo8 may not expose stable structured team/player pages; empty arrays mean the source page did not provide reliable candidates.",
  ].join(" "),
  keywords,
  counts: {
    teams: extracted.teams.length,
    players: extracted.players.length,
    matches: extracted.matches.length,
  },
  teams: extracted.teams,
  players: extracted.players,
  matches: extracted.matches,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(
  `Saved ${payload.counts.matches} matches, ${payload.counts.teams} teams, ${payload.counts.players} players to ${outputPath}`,
);

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const key = rawArgs[index];
    const next = rawArgs[index + 1];

    if (key === "--url" && next) {
      parsed.url = next;
      index += 1;
    } else if (key === "--output" && next) {
      parsed.output = next;
      index += 1;
    } else if (key === "--keywords" && next) {
      parsed.keywords = next;
      index += 1;
    }
  }

  return parsed;
}

async function assertRobotsAllowed(urlText) {
  const url = new URL(urlText);
  const robotsUrl = `${url.origin}/robots.txt`;

  try {
    const robotsText = await fetchText(robotsUrl);
    const disallows = readRobotsDisallows(robotsText);
    const blocked = disallows.some((rule) => {
      if (!rule || rule === "") return false;
      if (rule === "/") return true;
      return url.pathname.startsWith(rule);
    });

    if (blocked) {
      throw new Error(`robots.txt disallows crawling ${url.pathname}`);
    }
  } catch (error) {
    if (error.message.includes("robots.txt disallows")) {
      throw error;
    }

    console.warn(`Could not read robots.txt from ${robotsUrl}; continuing cautiously.`);
  }
}

function readRobotsDisallows(robotsText) {
  const lines = robotsText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);

  const disallows = [];
  let appliesToAll = false;

  for (const line of lines) {
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue.join(":").trim();

    if (key === "user-agent") {
      appliesToAll = value === "*";
    } else if (appliesToAll && key === "disallow") {
      disallows.push(value);
    }
  }

  return disallows;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} ${url}`);
  }

  return response.text();
}

function extractWorldCupData(html, baseUrl, keywordsToMatch) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const candidateBlocks = [
    ...cleaned.matchAll(/<li\b[\s\S]*?<\/li>/gi),
    ...cleaned.matchAll(/<p\b[\s\S]*?<\/p>/gi),
    ...cleaned.matchAll(/<tr\b[\s\S]*?<\/tr>/gi),
  ].map((match) => match[0]);

  const seen = new Set();
  const matches = [];
  const teamMap = new Map();
  const playerMap = new Map();

  for (const block of candidateBlocks) {
    const text = toText(block);
    const normalizedText = normalizeWhitespace(text);

    if (!normalizedText || seen.has(normalizedText)) continue;
    if (!keywordsToMatch.some((keyword) => normalizedText.includes(keyword))) continue;

    const time = normalizedText.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0] || "";
    const links = extractLinks(block, baseUrl);
    const teams = guessTeams(normalizedText);
    const players = guessPlayers(normalizedText);

    for (const team of teams) {
      addCandidate(teamMap, team, normalizedText);
    }

    for (const player of players) {
      addCandidate(playerMap, player, normalizedText);
    }

    if (time || teams.length > 0 || links.length > 0) {
      matches.push({
        rawText: normalizedText,
        time,
        teams,
        players,
        links,
      });
    }

    seen.add(normalizedText);
  }

  return {
    teams: mapToCandidates(teamMap),
    players: mapToCandidates(playerMap),
    matches,
  };
}

function addCandidate(map, name, sourceText) {
  const cleanName = normalizeWhitespace(name);

  if (!cleanName) return;
  if (!map.has(cleanName)) {
    map.set(cleanName, {
      name: cleanName,
      sourceTexts: [],
    });
  }

  map.get(cleanName).sourceTexts.push(sourceText);
}

function mapToCandidates(map) {
  return [...map.values()].map((candidate) => ({
    ...candidate,
    sourceTexts: [...new Set(candidate.sourceTexts)].slice(0, 5),
  }));
}

function toText(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(div|p|li|span|a|td|tr)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function extractLinks(html, baseUrl) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      text: normalizeWhitespace(toText(match[2])),
      url: new URL(match[1], baseUrl).toString(),
    }))
    .filter((link) => link.text || link.url);
}

function guessTeams(text) {
  const cleaned = text
    .replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/g, " ")
    .replace(/世界杯|世俱杯|足球|小组赛|淘汰赛|半决赛|决赛|第\d+轮|[A-H]组/g, " ");

  const match = cleaned.match(
    /([\u4e00-\u9fa5A-Za-z0-9·.\s]{2,24})\s*(?:vs|VS|v|V|[-－—对])\s*([\u4e00-\u9fa5A-Za-z0-9·.\s]{2,24})/,
  );

  if (!match) return [];

  return [normalizeWhitespace(match[1]), normalizeWhitespace(match[2])].filter(Boolean);
}

function guessPlayers(text) {
  const playerHints = [
    "梅西",
    "姆巴佩",
    "哈兰德",
    "贝林厄姆",
    "维尼修斯",
    "内马尔",
    "C罗",
    "凯恩",
    "萨卡",
    "福登",
    "劳塔罗",
    "莫德里奇",
    "德布劳内",
    "罗德里",
    "亚马尔",
    "佩德里",
  ];

  return playerHints.filter((name) => text.includes(name));
}

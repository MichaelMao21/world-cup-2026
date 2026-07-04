import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_OUTPUT = "data/fifa-worldcup-raw.json";
const OFFICIAL_PAGES = [
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026",
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams",
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures",
];

const FIFA_API_CANDIDATES = [
  "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=17&idSeason=285026",
  "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=17&idSeason=255711",
  "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=17",
];

const USER_AGENT =
  "WorldCupWatchGuidePrototype/0.1 (+local manual content workflow; official FIFA data check)";

const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(args.output || DEFAULT_OUTPUT);
const pages = args.url ? [args.url] : OFFICIAL_PAGES;
const apiUrls = args.api ? [args.api] : FIFA_API_CANDIDATES;
const inputHtmlPaths = args.inputHtml ? args.inputHtml.split(",").map((path) => path.trim()).filter(Boolean) : [];

if (args.inputDir) {
  const directoryPath = resolve(args.inputDir);
  const fileNames = await readdir(directoryPath);

  inputHtmlPaths.push(
    ...fileNames
      .filter((name) => name.toLowerCase().endsWith(".html"))
      .sort()
      .map((name) => resolve(directoryPath, name)),
  );
}

const includeRemote = inputHtmlPaths.length === 0 || args.includeRemote;

const sources = [];
const teams = new Map();
const players = new Map();
const matches = new Map();

if (includeRemote) {
  for (const url of apiUrls) {
    const result = await fetchOptionalJson(url);
    sources.push({ url, type: "api", ok: result.ok, status: result.status, error: result.error });

    if (result.ok) {
      ingestUnknownJson(result.data, { sourceUrl: url, teams, players, matches });
    }
  }
}

for (const inputPath of inputHtmlPaths) {
  try {
    const html = await readFile(resolve(inputPath), "utf8");
    sources.push({ url: inputPath, type: "local-html", ok: true, status: 200 });
    ingestHtml(html, { sourceUrl: inputPath, teams, players, matches });
  } catch (error) {
    sources.push({ url: inputPath, type: "local-html", ok: false, status: 0, error: error.message });
  }
}

if (includeRemote) {
  for (const url of pages) {
    const result = await fetchOptionalText(url);
    sources.push({ url, type: "page", ok: result.ok, status: result.status, error: result.error });

    if (result.ok) {
      ingestHtml(result.text, { sourceUrl: url, teams, players, matches });
    }
  }
}

const payload = {
  sourceName: "FIFA official website",
  scrapedAt: new Date().toISOString(),
  note: [
    "This file contains public factual candidates from FIFA official pages/API candidates.",
    "Review manually before publishing.",
    "If players is empty, FIFA did not expose squad data through the checked public sources.",
  ].join(" "),
  sources,
  counts: {
    teams: teams.size,
    players: players.size,
    matches: matches.size,
  },
  teams: [...teams.values()],
  players: [...players.values()],
  matches: [...matches.values()],
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
    } else if (key === "--api" && next) {
      parsed.api = next;
      index += 1;
    } else if (key === "--output" && next) {
      parsed.output = next;
      index += 1;
    } else if (key === "--input-html" && next) {
      parsed.inputHtml = next;
      index += 1;
    } else if (key === "--input-dir" && next) {
      parsed.inputDir = next;
      index += 1;
    } else if (key === "--include-remote") {
      parsed.includeRemote = true;
    }
  }

  return parsed;
}

async function fetchOptionalJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json,text/plain,*/*",
      },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: response.statusText };
    }

    return { ok: true, status: response.status, data: await response.json() };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

async function fetchOptionalText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: response.statusText };
    }

    return { ok: true, status: response.status, text: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

function ingestUnknownJson(value, stores) {
  const seen = new Set();
  walk(value, (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (seen.has(node)) return;
    seen.add(node);

    const match = normalizeMatchFromObject(node, stores.sourceUrl);
    if (match) addById(stores.matches, match);

    const teamCandidates = normalizeTeamsFromObject(node, stores.sourceUrl);
    for (const team of teamCandidates) addById(stores.teams, team);

    const playerCandidates = normalizePlayersFromObject(node, stores.sourceUrl);
    for (const player of playerCandidates) addById(stores.players, player);
  });
}

function walk(value, visitor) {
  visitor(value);

  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) walk(item, visitor);
  }
}

function normalizeMatchFromObject(node, sourceUrl) {
  const home = findName(node.HomeTeam || node.homeTeam || node.Home || node.home);
  const away = findName(node.AwayTeam || node.awayTeam || node.Away || node.away);
  const date = node.Date || node.date || node.MatchDate || node.matchDate || node.LocalDate;
  const stage = findName(node.StageName || node.stageName || node.Stage || node.stage);
  const venue = findName(node.Stadium || node.stadium || node.Venue || node.venue);

  if (!home && !away && !date && !venue) return null;

  const id = String(node.IdMatch || node.idMatch || node.MatchId || node.matchId || node.Id || `${home}-${away}-${date}`);

  return compactObject({
    id: `fifa-match-${id}`,
    sourceUrl,
    rawId: id,
    date: date || "",
    stage: stage || "",
    venue: venue || "",
    homeTeam: home || "",
    awayTeam: away || "",
    status: findName(node.MatchStatus || node.matchStatus || node.Status || node.status) || "",
  });
}

function normalizeTeamsFromObject(node, sourceUrl) {
  const candidates = [
    node.Team,
    node.team,
    node.HomeTeam,
    node.homeTeam,
    node.AwayTeam,
    node.awayTeam,
    node.Competitor,
    node.competitor,
  ];

  return candidates
    .map((item) => normalizeEntity(item, "team", sourceUrl))
    .filter(Boolean);
}

function normalizePlayersFromObject(node, sourceUrl) {
  const candidates = [node.Player, node.player, node.Person, node.person];

  if (looksLikePlayer(node)) {
    candidates.push(node);
  }

  return candidates
    .map((item) => normalizeEntity(item, "player", sourceUrl))
    .filter(Boolean);
}

function normalizeEntity(value, type, sourceUrl) {
  const name = findName(value);
  if (!name) return null;

  const id =
    value && typeof value === "object"
      ? value.IdTeam || value.idTeam || value.IdPlayer || value.idPlayer || value.Id || value.id || slugify(name)
      : slugify(name);

  return compactObject({
    id: `fifa-${type}-${id}`,
    sourceUrl,
    name,
    type,
  });
}

function looksLikePlayer(node) {
  return Boolean(
    (node.Position || node.position || node.ShirtNumber || node.shirtNumber || node.DateOfBirth) &&
      findName(node),
  );
}

function ingestHtml(html, stores) {
  ingestFifaRenderedSquad(html, stores);

  for (const json of extractJsonLd(html)) {
    ingestUnknownJson(json, stores);
  }

  const nextData = extractNextData(html);
  if (nextData) ingestUnknownJson(nextData, stores);
}

function ingestFifaRenderedSquad(html, stores) {
  if (!html.includes("player-badge-card_badgeCard")) return;

  const pageUrl = extractSavedPageUrl(html) || stores.sourceUrl;
  const titleMatch = html.match(/<title>([^<|]+)\s*\|\s*FIFA World Cup/i);
  const teamName = titleMatch ? decodeHtml(titleMatch[1]).trim() : "";
  const teamCode = html.match(/flags-sq-4\/([A-Z]{3})/i)?.[1]?.toUpperCase() || "";
  const teamId = teamCode ? `fifa-team-${teamCode.toLowerCase()}` : `fifa-team-${slugify(teamName)}`;

  if (teamName) {
    addById(stores.teams, compactObject({
      id: teamId,
      sourceUrl: pageUrl,
      name: teamName,
      type: "team",
      code: teamCode,
      flagUrl: teamCode ? `https://api.fifa.com/api/v3/picture/flags-sq-4/${teamCode}` : "",
    }));
  }

  const cardStarts = [...html.matchAll(/<div class="player-badge-card_badgeCard__[^"]*[^>]*>/gi)].map(
    (match) => match.index,
  );
  const namePattern =
    /<div class="player-badge-card_playerName__[^"]*">[\s\S]*?<span[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;

  for (const match of html.matchAll(namePattern)) {
    const cardStart = findPreviousIndex(cardStarts, match.index);
    const nextCardStart = cardStarts.find((index) => index > match.index) || html.length;
    const cardHtml = html.slice(cardStart, nextCardStart);
    const name = decodeHtml(match[1]).trim();
    const position = cardHtml.match(
      /player-badge-card_playerPosition__[^"]*">[\s\S]*?<span[^>]*>[\s\S]*?<span[^>]*>(Goalkeeper|Defender|Midfielder|Forward)<\/span>/i,
    )?.[1] || "";
    const imageSet = decodeHtml(
      cardHtml.match(/<img[^>]+alt="[^"]+"[^>]+srcset="([^"]*digitalhub\.fifa\.com[^"]*)"/i)?.[1] || "",
    );
    const imageUrl = imageSet.split(",")[0]?.trim().split(/\s+/)[0] || "";
    const fifaPlayerId = imageSet.match(/_(\d+)\?/)?.[1] || "";

    if (!name || !position) continue;

    addById(stores.players, compactObject({
      id: `fifa-player-${teamCode.toLowerCase()}-${slugify(name)}`,
      sourceUrl: pageUrl,
      name,
      type: "player",
      position,
      teamId,
      teamName,
      fifaPlayerId,
      imageUrl,
    }));
  }
}

function findPreviousIndex(indexes, target) {
  let result = 0;

  for (const index of indexes) {
    if (index > target) break;
    result = index;
  }

  return result;
}

function extractSavedPageUrl(html) {
  const match = html.match(/<!--\s*saved from url=\(\d+\)(https?:\/\/[^\s]+)\s*-->/i);
  return match ? decodeHtml(match[1]) : "";
}

function extractJsonLd(html) {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => safeJsonParse(decodeHtml(match[1])))
    .filter(Boolean);
}

function extractNextData(html) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  return match ? safeJsonParse(decodeHtml(match[1])) : null;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

function findName(value) {
  if (!value) return "";
  if (typeof value === "string") return normalizeWhitespace(value);
  if (typeof value !== "object") return "";

  return normalizeWhitespace(
    value.Name ||
      value.name ||
      value.ShortName ||
      value.shortName ||
      value.DisplayName ||
      value.displayName ||
      value.Description ||
      value.description ||
      value.Abbreviation ||
      value.abbreviation ||
      "",
  );
}

function addById(map, item) {
  if (!item?.id) return;

  if (!map.has(item.id)) {
    map.set(item.id, item);
    return;
  }

  map.set(item.id, compactObject({ ...map.get(item.id), ...item }));
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""),
  );
}

function toText(html) {
  return normalizeWhitespace(
    decodeHtml(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function decodeHtml(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function normalizeWhitespace(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function slugify(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "");
}

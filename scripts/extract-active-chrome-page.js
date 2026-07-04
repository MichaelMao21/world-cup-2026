ObjC.import("Foundation");

const chrome = Application("Google Chrome");
const scheduleUrl = "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=US&wtw-filter=ALL";
let tabs = chrome.windows().flatMap((window) => window.tabs());
let tab = tabs.find((item) => (item.url() || "").includes("/scores-fixtures"));

if (!tab) {
  chrome.windows[0].tabs.push(chrome.Tab({ url: scheduleUrl }));
  delay(8);
  tabs = chrome.windows().flatMap((window) => window.tabs());
  tab = tabs.find((item) => (item.url() || "").includes("/scores-fixtures"));
}

if (!tab) {
  throw new Error("FIFA scores-fixtures tab could not be opened");
}
const pageScript = `
  function findMatchDate(element) {
    const datePattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\s+\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+2026/i;
    let cursor = element;

    for (let depth = 0; cursor && depth < 10; depth += 1) {
      let previous = cursor.previousElementSibling;

      while (previous) {
        const text = (previous.innerText || previous.textContent || "").replace(/\\s+/g, " ").trim();
        const match = text.match(datePattern);
        if (match) return match[0];
        previous = previous.previousElementSibling;
      }

      cursor = cursor.parentElement;
    }

    return "";
  }

  JSON.stringify(
    Array.from(document.querySelectorAll('a[href*="/match-centre/match/"]')).map((a) => ({
      href: a.href,
      text: (a.innerText || a.textContent || "").replace(/\\s+/g, " ").trim(),
      aria: a.getAttribute("aria-label") || "",
      date: findMatchDate(a)
    }))
  )
`;

let result = "[]";

for (let attempt = 0; attempt < 6; attempt += 1) {
  result = tab.execute({ javascript: pageScript }) || "[]";
  if (JSON.parse(result).length >= 100) break;
  delay(5);
}

const matchCount = JSON.parse(result).length;
if (matchCount < 100) {
  throw new Error(`FIFA schedule not fully loaded: ${matchCount} matches found`);
}

const outputPath = "/Users/maozhan/Documents/VB-世界杯观赛指南/data/fifa-page-matches.json";
const written = $(result || "[]").writeToFileAtomicallyEncodingError(
  $(outputPath),
  true,
  $.NSUTF8StringEncoding,
  null,
);

console.log(JSON.stringify({
  outputPath,
  written: Boolean(written),
  matchCount,
}));

ObjC.import("Foundation");

const chrome = Application("Google Chrome");
const pages = [
  {
    key: "standings",
    url: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings",
    path: "/en/tournaments/mens/worldcup/canadamexicousa2026/standings",
    output: "/Users/maozhan/Documents/VB-世界杯观赛指南/data/fifa-standings-inspect.json",
  },
  {
    key: "power-rankings",
    url: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/power-rankings",
    path: "/en/tournaments/mens/worldcup/canadamexicousa2026/power-rankings",
    output: "/Users/maozhan/Documents/VB-世界杯观赛指南/data/fifa-power-rankings-inspect.json",
  },
];

const pageScript = `
  JSON.stringify({
    title: document.title,
    url: location.href,
    mainText: (document.querySelector('main')?.innerText || document.body.innerText || '').slice(0, 120000),
    tables: Array.from(document.querySelectorAll('table')).map((table) => ({
      text: (table.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim(),
      html: table.outerHTML.slice(0, 30000)
    })),
    candidates: Array.from(document.querySelectorAll('[class*="standing"], [class*="Standing"], [class*="ranking"], [class*="Ranking"], [class*="group"], [class*="Group"]'))
      .filter((element) => (element.innerText || '').trim())
      .slice(0, 300)
      .map((element) => ({
        tag: element.tagName,
        className: String(element.className || ''),
        text: (element.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 2000)
      })),
    images: Array.from(document.querySelectorAll('main img[alt]')).slice(0, 300).map((image) => ({
      alt: image.alt,
      src: image.currentSrc || image.src
    }))
  })
`;

const summaries = [];

for (const page of pages) {
  let tabs = chrome.windows().flatMap((window) => window.tabs());
  let tab = tabs.find((item) => (item.url() || "").includes(page.path));

  if (!tab) {
    chrome.windows[0].tabs.push(chrome.Tab({ url: page.url }));
    delay(2);
    tabs = chrome.windows().flatMap((window) => window.tabs());
    tab = tabs.find((item) => (item.url() || "").includes(page.path));
  }

  if (!tab) throw new Error(`${page.key} tab could not be opened`);

  let result = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    result = tab.execute({ javascript: pageScript }) || "";
    if (result && JSON.parse(result).mainText.length > 500) break;
    delay(5);
  }

  if (!result) throw new Error(`${page.key} page did not return data`);

  const written = $(result).writeToFileAtomicallyEncodingError(
    $(page.output),
    true,
    $.NSUTF8StringEncoding,
    null,
  );

  const parsed = JSON.parse(result);
  summaries.push({
    key: page.key,
    output: page.output,
    written: Boolean(written),
    textLength: parsed.mainText.length,
    tables: parsed.tables.length,
    candidates: parsed.candidates.length,
    images: parsed.images.length,
  });
}

console.log(JSON.stringify(summaries));

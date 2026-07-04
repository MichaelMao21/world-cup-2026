const chrome = Application("Google Chrome");
const tabs = chrome.windows().flatMap((window) => window.tabs());
const tab = tabs.find((item) => (item.url() || "").includes("/VB-%E4%B8%96%E7%95%8C%E6%9D%AF%E8%A7%82%E8%B5%9B%E6%8C%87%E5%8D%97/prototype.html"));

if (!tab) {
  throw new Error("Prototype tab not found");
}

tab.reload();
delay(2);

const result = tab.execute({
  javascript: `
    JSON.stringify({
      teams: window.PROTOTYPE_DATA?.teams?.length || 0,
      players: window.PROTOTYPE_DATA?.players?.length || 0,
      matches: window.PROTOTYPE_DATA?.matches?.length || 0,
      venues: window.PROTOTYPE_DATA?.venues?.length || 0,
      scheduleDates: document.querySelectorAll('#schedule-list > section').length,
      resultDates: document.querySelectorAll('#results-list > section').length,
      venueCards: document.querySelectorAll('#venue-list > article').length
    })
  `,
});

console.log(JSON.stringify({
  title: tab.title(),
  url: tab.url(),
  result: result || "",
}));

# 数据源抓取说明

## FIFA 官方抓取策略

脚本位置：

```bash
npm run scrape:fifa
```

默认抓取：

```text
https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026
https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams
https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures
```

默认输出：

```text
data/fifa-worldcup-raw.json
```

可指定单个 FIFA 页面或 API 候选地址：

```bash
npm run scrape:fifa -- --url https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams --output data/fifa-worldcup-raw.json
```

```bash
npm run scrape:fifa -- --api "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=17" --output data/fifa-worldcup-raw.json
```

如果当前 shell 不能联网，可以在浏览器打开 FIFA 页面并另存为 HTML，再用本地 HTML 解析：

```bash
npm run scrape:fifa -- --input-html ./downloads/fifa-teams.html,./downloads/fifa-fixtures.html --output data/fifa-worldcup-raw.json
```

批量读取 `downloads` 中的所有 HTML：

```bash
npm run scrape:fifa -- --input-dir downloads --output data/fifa-teams-raw.json
```

输出结构固定为：

```json
{
  "teams": [],
  "players": [],
  "matches": []
}
```

## FIFA 赛程、赛果与场馆

在 Chrome 打开 FIFA `scores-fixtures` 页面，并开启：

```text
查看 -> 开发者 -> 允许 Apple 事件中的 JavaScript
```

提取并更新数据：

```bash
osascript -l JavaScript scripts/extract-active-chrome-page.js
node scripts/normalize-fifa-matches.mjs
npm run build:prototype-data
```

生成文件：

- `data/fifa-page-matches.json`：FIFA 页面原始比赛卡片
- `data/fifa-matches.json`：标准化比赛、赛果与场馆
- `data/prototype-data.js`：Demo 使用的统一数据包

## 直播吧抓取策略

脚本位置：

```bash
npm run scrape:zhibo8
```

默认抓取：

```text
https://www.zhibo8.cc/
```

默认输出：

```text
data/zhibo8-worldcup-raw.json
```

可指定 URL、关键词和输出文件：

```bash
npm run scrape:zhibo8 -- --url https://www.zhibo8.cc/ --keywords 世界杯,足球,球队,球员,赛程 --output data/zhibo8-worldcup-raw.json
```

## 抓取边界

第一版只抓公开页面里的事实性候选数据：

- 比赛时间
- 赛事/阶段文本
- 对阵双方候选
- 球员名候选
- 文字直播、比分、动画等链接候选

不抓取：

- 新闻正文
- 长篇球队介绍
- 赛报全文
- 图片、GIF、视频文件
- 需要登录或绕过限制的页面

## 使用方式

抓取结果需要人工校对后，再转入小程序正式数据，例如：

- `matches`
- `teams`
- `players`

不要把抓取结果原样发布。直播吧可以作为事实数据参考，但小程序里的小白解读、球队评价、比赛看点、比分预测应使用自有原创内容。

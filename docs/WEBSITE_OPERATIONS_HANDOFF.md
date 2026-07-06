# 世界杯观赛指南网站运维交接文档

最后更新：2026-07-06

本文档给接手运维的 Agent 使用。目标是让 Agent 能快速理解网站结构、数据来源、部署方式、自动化 Loop、服务器连接和 GitHub 状态。

> 隐私与安全规则：本文档不会写入 `.env`、飞书 open_id、微信 AppSecret、CloudBase 私钥、访问令牌、数据库导出等敏感值。接手 Agent 如需这些值，应在本机私密文件或对应云控制台读取，不要提交到 GitHub。

## 1. 快速入口

| 项目 | 内容 |
| --- | --- |
| 生产域名 | https://www.pkgamecup.cn/ |
| CloudBase 默认域名 | https://worldcup2026-d7gfmdarw394a4109-1312940160.tcloudbaseapp.com |
| 本地项目路径 | `/Users/maozhan/Documents/VB-世界杯观赛指南` |
| 主 GitHub 仓库 | https://github.com/MichaelMao21/world-cup-2026 |
| 备份 GitHub 仓库 | https://github.com/MichaelMao21/pkgamecup |
| 当前分支 | `master` |
| CloudBase 环境 ID | `worldcup2026-d7gfmdarw394a4109` |
| 微信公众号 AppID | `wx394b4d5d5bd16947` |
| 主页面源码 | `prototype.html` |
| 构建输出目录 | `dist/` |
| 网站数据包 | `data/prototype-data.js` |
| 前端配置 | `js/app-config.js` |

## 2. 当前产品能力

网站是一个移动端 H5 世界杯观赛指南，核心功能包括：

- 首页今日观赛、进行中比赛、今日赛果
- 赛程、赛果、球队、球员数据、场馆信息
- 射手榜、助攻榜、球队统计榜
- 预测 PK 房：创建房间、好友加入、提交预测、查看预测
- 赛后预测结算与“神预言海报”
- 微信分享卡片和微信 OAuth 昵称绑定
- CloudBase 数据存储和云函数
- L2 Loop Engineering 自动同步、构建、发布和飞书通知

## 3. 代码与目录结构

主要文件：

| 路径 | 用途 |
| --- | --- |
| `prototype.html` | H5 单页主应用，大部分 UI、交互、海报生成逻辑在这里 |
| `js/app-config.js` | 公开前端配置，包含 CloudBase envId、SDK URL、微信 AppID |
| `js/prediction-service.js` | 预测 PK、用户资料、房间、预测记录、排行榜、CloudBase/Supabase/demo 模式逻辑 |
| `data/` | 静态和生成后的比赛、球队、榜单、统计数据 |
| `assets/` | 分享图、二维码、比赛海报、赛后海报模板 |
| `functions/` | CloudBase 云函数 |
| `scripts/` | 抓取、同步、构建、检查、发布、Loop 自动化脚本 |
| `.loop/` | Loop Engineering 配置、状态、日志和报告 |
| `dist/` | `npm run build:h5` 生成的发布目录，不应作为源码维护 |
| `supabase/schema.sql` | 旧/备用 Supabase 数据库结构 |
| `cloudbaserc.json` | CloudBase 环境、函数和定时触发配置 |
| `MP_verify_MG3DG2tDMN04zQGx.txt` | 微信域名验证文件，必须发布到网站根目录 |

不要提交：

- `.env`
- `.env.*`
- `.loop/CONFIG.local.json`
- `.loop/STATE.md`
- `.loop/logs/`
- `.loop/reports/`
- `.loop/scheduler-state.json`
- `dist/`
- `node_modules/`
- `.github-pages/`
- `downloads/`
- 用户数据导出、截图、临时日志、令牌、私钥

## 4. 静态数据与动态数据

### 4.1 静态/源码级数据

这些数据随 Git 仓库维护，构建后会进入 `data/prototype-data.js` 或 `dist/`：

| 文件 | 说明 |
| --- | --- |
| `data/fifa-teams-raw.json` | 球队和球员基础数据 |
| `data/fifa-matches.json` | 标准化比赛日历、赛果、半场比分、红黄牌、场馆 |
| `data/fifa-page-matches.json` | FIFA 页面抽取后的原始比赛卡片数据 |
| `data/fifa-insights.json` | 赛事统计、球队统计、积分榜等计算结果 |
| `data/player-stats.json` | 射手榜、助攻榜、进攻榜等球员榜单 |
| `data/match-previews.json` | 赛前前瞻/预测文案数据 |
| `data/prototype-data.js` | 前端实际读取的统一数据包，格式为 `window.PROTOTYPE_DATA = ...` |
| `assets/poster-templates/index.json` | 赛后神预言海报模板索引 |
| `assets/poster-templates/*` | 各场比赛的赛后海报模板 |
| `assets/match-posters/*` | 赛前/分享海报背景图 |
| `assets/qr/pkgamecup-landing-qr.png` | 海报二维码 |

前端读取方式：

- `prototype.html` 通过 `<script src="./data/prototype-data.js?...">` 读取统一数据包。
- `scripts/build-h5.mjs` 会自动给 `prototype-data.js` 加构建版本号，降低微信内置浏览器缓存影响。

### 4.2 动态/运行时数据

运行时用户数据主要在 CloudBase 数据库，不应进入 Git：

| CloudBase 集合 | 用途 |
| --- | --- |
| `profiles` | 用户资料、昵称、头像文字、微信资料等 |
| `prediction_rooms` | 预测 PK 房 |
| `room_members` | 房间参与关系 |
| `predictions` | 用户预测答案、积分、命中项 |
| `events` | 前端行为事件埋点 |
| `matches` | 云函数同步的比赛赛果副本 |
| `sync_logs` | 云函数同步日志 |

本地浏览器也会存少量前端缓存：

| localStorage key | 用途 |
| --- | --- |
| `world-cup-prediction-user-v1` | demo/本地用户 ID |
| `world-cup-prediction-demo-v1` | demo 模式数据 |
| `world-cup-prediction-profile-v1` | 本地用户资料缓存 |
| `world-cup-prediction-history-v1` | 本地预测历史缓存 |
| `world-cup-prediction-draft:{matchId}` | 单场预测草稿 |
| `wechat_nickname` | 微信昵称缓存 |
| `world-cup-wechat-oauth-state` | 微信 OAuth 状态 |

## 5. 数据生成与同步链路

当前主链路：

1. `scripts/sync-espn-match-results.mjs`
   - 从 ESPN scoreboard 同步已结束赛果。
   - 会查北京时间比赛日对应 ESPN 日期的前后一天，处理 UTC 跨日问题。
   - 数据源示例：`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD`

2. `scripts/enrich-events.mjs`
   - 补充半场比分、红黄牌、半场首球等事件数据。

3. `scripts/sync-player-stats.mjs`
   - 同步/计算射手榜、助攻榜、进攻榜等。
   - 输出：`data/player-stats.json`

4. `scripts/calc-insights.mjs`
   - 重算赛事总览、球队统计、积分榜、总进球、已完成场次。
   - 输出：`data/fifa-insights.json`

5. `scripts/build-prototype-data.mjs`
   - 汇总球队、球员、比赛、场馆、积分榜、球队统计、球员榜单、前瞻数据。
   - 输出：`data/prototype-data.js`

6. `scripts/build-h5.mjs`
   - 生成 `dist/index.html`
   - 复制 `data/`、`js/`、`assets/`、微信验证文件。
   - 更新 `prototype-data.js?v=构建时间`。

7. `scripts/push-cloudbase.mjs`
   - 执行 `tcb hosting deploy dist/ -e worldcup2026-d7gfmdarw394a4109`
   - 发布到 CloudBase Hosting。

常用命令：

```bash
npm run sync:results
npm run sync:player-stats
npm run build:prototype-data
npm run build:h5
PATH="/opt/local/bin:/Users/maozhan/.npm-global/bin:$PATH" node scripts/push-cloudbase.mjs
```

完整手动刷新发布：

```bash
PATH="/opt/local/bin:/Users/maozhan/.npm-global/bin:$PATH" node scripts/sync-espn-match-results.mjs
node scripts/sync-player-stats.mjs
node scripts/calc-insights.mjs
node scripts/build-prototype-data.mjs
node scripts/build-h5.mjs
PATH="/opt/local/bin:/Users/maozhan/.npm-global/bin:$PATH" node scripts/push-cloudbase.mjs
```

## 6. 连接的服务器与外部服务

### 6.1 Tencent CloudBase

| 项目 | 内容 |
| --- | --- |
| 环境 ID | `worldcup2026-d7gfmdarw394a4109` |
| 用途 | 静态托管、数据库、云函数 |
| 配置文件 | `cloudbaserc.json` |
| 前端 SDK | `https://static.cloudbase.net/cloudbase-js-sdk/3.5.2/cloudbase.full.js` |
| 发布命令 | `tcb hosting deploy dist/ -e worldcup2026-d7gfmdarw394a4109` |

CloudBase 云函数：

| 函数 | 路径 | 用途 |
| --- | --- | --- |
| `syncMatchResults` | `functions/syncMatchResults/index.js` | 定时同步 FIFA 赛果到 CloudBase `matches` 集合，并写入 `sync_logs` |
| `wechatShareConfig` | `functions/wechatShareConfig/index.js` | 生成微信 JS-SDK 分享签名；也处理微信 OAuth 用户资料 |

`syncMatchResults` 在 `cloudbaserc.json` 中配置了 timer：

```text
0 */5 * * * * *
```

即每 5 分钟触发一次。注意：本地 L2 Loop 目前也会同步并发布静态数据，两者用途不同：

- CloudBase 云函数同步运行时数据库里的 `matches` 集合。
- 本地 L2 Loop 同步 Git 工作区里的静态数据文件并发布 H5。

### 6.2 微信公众平台

| 项目 | 内容 |
| --- | --- |
| AppID | `wx394b4d5d5bd16947` |
| 配置域名 | `www.pkgamecup.cn` |
| 验证文件 | `MP_verify_MG3DG2tDMN04zQGx.txt` |
| 验证 URL | `https://www.pkgamecup.cn/MP_verify_MG3DG2tDMN04zQGx.txt` |
| 云函数 | `wechatShareConfig` |

重要规则：

- 微信域名配置应使用 `www.pkgamecup.cn`。
- 不要写 `https://`。
- 不要写路径、端口。
- `WECHAT_APP_SECRET` 只能配置在 CloudBase 云函数环境变量或安全配置里，不能提交 Git。

### 6.3 ESPN/FIFA 数据源

当前赛果主同步源：

```text
https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD
```

FIFA 数据源和历史抓取入口：

```text
https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026
https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams
https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures
https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=17&idSeason=285023
```

相关脚本：

- `scripts/scrape-fifa.mjs`
- `scripts/normalize-fifa-matches.mjs`
- `scripts/extract-active-chrome-page.js`
- `scripts/sync-espn-match-results.mjs`
- `scripts/enrich-events.mjs`
- `scripts/sync-player-stats.mjs`

### 6.4 飞书/Lark

用途：

- L2 Loop 巡检报告推送。

配置：

- 公共配置：`.loop/CONFIG.json`
- 私密配置：`.loop/CONFIG.local.json`

`.loop/CONFIG.local.json` 包含飞书接收人的私密 ID，已被 `.gitignore` 排除。不要把内容写入文档或提交 Git。

本机使用：

```text
/Users/maozhan/.npm-global/bin/lark-cli
```

当前 lark-cli 曾提示版本：

- current: `1.0.59`
- latest: `1.0.65`

需要时可运行：

```bash
lark-cli update
```

### 6.5 Supabase

Supabase 是备用/旧方案，当前前端配置里为空：

```js
supabaseUrl: "",
supabaseAnonKey: ""
```

相关文件：

- `supabase/schema.sql`
- `DEPLOYMENT.md`

如果未来改回 Supabase，需要启用 Anonymous Auth，并执行 `supabase/schema.sql`。

## 7. GitHub 与版本控制

当前 Git remote：

```text
origin          https://github.com/MichaelMao21/world-cup-2026.git
pkgamecup-backup https://github.com/MichaelMao21/pkgamecup.git
```

当前分支：

```text
master
```

协作规则：

- 主仓库：`MichaelMao21/world-cup-2026`
- 私有/备份仓库：`MichaelMao21/pkgamecup`
- 代码、静态配置、静态数据、模板走 Git。
- 用户数据、CloudBase 数据库导出、AppSecret、令牌、私钥不进 Git。

当前工作区注意：

- 当前仓库存在大量未提交变更和新增文件，包括 Loop L2、数据同步、海报模板、数据文件、构建脚本等。
- 接手 Agent 在修改前必须先运行：

```bash
git status --short
git diff --stat
```

- 不要用 `git reset --hard` 或 `git checkout -- .` 清理工作区。
- 如需交接稳定版本，建议先由当前维护者确认并提交当前变更。

## 8. L2 Loop Engineering 自动化

配置文件：

```text
.loop/CONFIG.json
.loop/CONFIG.local.json
.loop/RUNBOOK.md
.loop/scheduler-state.json
.loop/logs/
.loop/reports/
```

当前级别：

```text
L2
```

L2 允许自动修复范围：

- `match-results`
- `match-events`
- `player-stats`
- `team-stats`
- `prototype-data`
- `h5-build`
- `cloudbase-publish`
- `launchd-scheduler`

L2 禁止自动修复范围：

- `prediction-scoring-rules`
- `core-business-logic`
- `database-permissions`
- `login-or-payment`
- `large-ui-redesign`

触发规则：

- 开球后约 60 分钟：半场巡检
- 开球后约 120 分钟：完场巡检
- 非比赛日：每天 09:30 巡检
- 每 30 分钟：轻量兜底检查，只判断过去 6 小时是否有漏跑比赛事件；没有漏跑就退出，不跑完整同步

主要脚本：

| 脚本 | 用途 |
| --- | --- |
| `scripts/loop-daily.mjs` | 完整 L2 巡检：同步、构建、发布、检查、飞书推送 |
| `scripts/loop-scheduler.mjs` | 判断当前是否有半场/完场/补跑事件需要执行 |
| `scripts/install-loop-launchd.mjs` | 安装 macOS launchd 定时任务 |
| `scripts/loop-launchd-runner.sh` | launchd runner 脚本 |

常用命令：

```bash
npm run loop:daily
npm run loop:scheduler
npm run loop:install
```

推荐使用绝对 Node 路径：

```bash
PATH="/opt/local/bin:/Users/maozhan/.npm-global/bin:$PATH" /opt/local/bin/node scripts/loop-daily.mjs --trigger "手动巡检"
```

当前补充兜底：

- 因 macOS `launchd` 曾残留 `78` 状态，已额外写入 crontab 兜底。
- crontab 每 30 分钟运行一次 `scripts/loop-scheduler.mjs`。
- 该任务只做轻量判断；无事件时直接退出。

查看 crontab：

```bash
crontab -l | sed -n '/world-cup-guide-loop begin/,/world-cup-guide-loop end/p'
```

查看日志：

```bash
tail -100 .loop/logs/cron.out.log
tail -100 .loop/logs/cron.err.log
tail -100 .loop/logs/launchd.out.log
tail -100 .loop/logs/launchd.err.log
ls -lt .loop/reports | head
```

## 9. 构建、检查与发布

安装依赖：

```bash
npm install
```

检查：

```bash
npm run check:h5
npm run test:predictions
npm run validate:data
npm run test:data-assets
```

构建：

```bash
npm run build:prototype-data
npm run build:h5
```

发布：

```bash
PATH="/opt/local/bin:/Users/maozhan/.npm-global/bin:$PATH" node scripts/push-cloudbase.mjs
```

线上验证：

```bash
curl -L -s "https://www.pkgamecup.cn/data/prototype-data.js?ts=$(date +%s)" | rg "fifa-match-"
curl -L -s "https://www.pkgamecup.cn/?v=$(date +%s)" | rg "prototype-data|生成神预言海报"
```

## 10. CloudBase 云函数维护

云函数目录：

```text
functions/syncMatchResults/
functions/wechatShareConfig/
```

依赖：

```text
@cloudbase/node-sdk
```

`syncMatchResults`：

- 读取 `functions/syncMatchResults/matches-seed.json`
- 请求 FIFA API
- 写入 CloudBase `matches`
- 写入 CloudBase `sync_logs`

`wechatShareConfig`：

- 读取 `WECHAT_APP_ID`
- 读取 `WECHAT_APP_SECRET`
- 生成微信 JS-SDK 签名
- 支持 `event.action === "oauthProfile"` 获取微信 OAuth 用户资料

重要：

- 更新 `wechatShareConfig` 时不要覆盖线上 `WECHAT_APP_SECRET`。
- 不要把 `WECHAT_APP_SECRET` 写入 Git。

## 11. 海报系统

入口：

- 首页「今日赛果」完成比赛按钮：`生成神预言海报`
- 我的预测历史：`生成神预言海报`
- PK 房结算页：`分享我的神预言`

主要代码：

- `prototype.html` 中的 `generateMatchProphecyPoster`
- `generatePredictionHistoryPoster`
- `tryDrawTemplateProphecyPoster`
- `drawTemplatePosterText`
- `drawNorwayResultPosterText`
- `drawEnglandResultPosterText`

模板索引：

```text
assets/poster-templates/index.json
```

已存在模板：

- `assets/poster-templates/20260704-argentina-vs-cape-verde/`
- `assets/poster-templates/20260704-australia-vs-egypt/`
- `assets/poster-templates/20260704-colombia-vs-ghana/`
- `assets/poster-templates/20260706-brazil-vs-norway/`
- `assets/poster-templates/20260706-england-vs-mexico/`

分享海报背景：

- `assets/match-posters/brazil-vs-norway-share-poster.png`
- `assets/match-posters/england-vs-mexico-share-poster.png`
- `assets/match-posters/portugal-vs-spain-share-poster.png`
- `assets/match-posters/usa-vs-belgium-share-poster.png`

海报相关检查在：

```text
scripts/check-h5.mjs
```

## 12. 已知风险与运维注意事项

1. 微信缓存
   - 微信内置浏览器可能缓存旧 `prototype-data.js`。
   - `scripts/build-h5.mjs` 已通过版本号缓解。
   - 用户端仍异常时，让用户关闭微信网页重新打开。

2. UTC 跨日比赛
   - ESPN scoreboard 按 UTC 日期归档。
   - `scripts/sync-espn-match-results.mjs` 会查目标日期前后一天，避免北京时间跨日漏赛果。

3. launchd 状态
   - macOS `launchd` 曾残留 `78` 状态。
   - 目前同时有 crontab 兜底。
   - 接手 Agent 应优先确认 crontab 能运行，再排查 launchd。

4. 数据质量 warning
   - `validate-data` 的退出码 `2` 表示 warning，不等于失败。
   - 常见 warning：
     - 淘汰赛未来占位队名尚未确定，例如 `W89 vs W90`
     - 射手榜根据逐场事件校准某些球员数据

5. CloudBase 与本地静态数据双轨
   - CloudBase 数据库保存用户和运行时数据。
   - 网站展示主要比赛数据来自静态 `data/prototype-data.js`。
   - 比赛结果没有显示时，优先查静态数据包是否已发布。

6. 不要直接改 `dist/`
   - `dist/` 是构建产物。
   - 源码改 `prototype.html`、`js/`、`data/`、`assets/` 后重新构建。

## 13. 新 Agent 接手步骤

1. 进入项目：

```bash
cd "/Users/maozhan/Documents/VB-世界杯观赛指南"
```

2. 查看工作区：

```bash
git status --short
git remote -v
git branch --show-current
```

3. 确认网站配置：

```bash
cat js/app-config.js
cat cloudbaserc.json
cat .loop/CONFIG.json
```

4. 跑基础检查：

```bash
/opt/local/bin/node scripts/check-h5.mjs
/opt/local/bin/node scripts/test-prediction-service.mjs
```

5. 手动跑一次轻量调度：

```bash
PATH="/opt/local/bin:/Users/maozhan/.npm-global/bin:$PATH" /opt/local/bin/node scripts/loop-scheduler.mjs
```

6. 如需完整刷新：

```bash
PATH="/opt/local/bin:/Users/maozhan/.npm-global/bin:$PATH" /opt/local/bin/node scripts/loop-daily.mjs --trigger "人工接手巡检"
```

7. 验证线上：

```bash
curl -L -s "https://www.pkgamecup.cn/data/prototype-data.js?ts=$(date +%s)" | head
```

## 14. 敏感信息清单

这些文件或配置存在敏感信息，不要提交，不要复制到公开文档：

| 位置 | 内容 |
| --- | --- |
| `.env` | 本地环境变量，可能含令牌/密钥 |
| `.loop/CONFIG.local.json` | 飞书接收人 ID、私有通知配置 |
| CloudBase 控制台函数环境变量 | `WECHAT_APP_SECRET` 等 |
| lark-cli 本机认证 | 飞书登录态 |
| CloudBase 数据库 | 用户资料、预测房、预测记录 |

如果另一个 Agent 需要访问这些内容，应由用户在本机或云控制台授权，不要通过 GitHub 传递。

## 15. 当前最后一次已知验证

最近一次 L2 完整巡检：

```text
.loop/reports/20260706-182124.md
```

结果摘要：

- L2 巡检有提醒，但不是失败
- 同步赛果通过
- 同步球员榜单通过
- 重算球队统计通过
- 重建网站数据包通过
- 发布 CloudBase 通过
- 页面契约通过
- 预测流程通过
- 飞书推送成功

当时今日赛果：

- Brazil 1-2 Norway
- Mexico 2-3 England


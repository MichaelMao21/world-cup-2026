# 世界杯观赛指南

H5 site for World Cup schedules, match results, team data, prediction PK rooms, and WeChat sharing.

## Source Of Truth

- Code and static configuration: GitHub repository.
- Online hosting: Tencent CloudBase Hosting.
- Runtime user data: CloudBase database.
- Cloud functions: CloudBase functions.

Do not store user data, exported database records, AppSecret, access tokens, or private keys in this repository.

## Main Files

- `prototype.html`: main H5 page.
- `js/app-config.js`: public frontend configuration.
- `js/prediction-service.js`: prediction, profile, room, and CloudBase data logic.
- `data/`: static teams, matches, venues, standings, and prototype data.
- `functions/`: CloudBase cloud functions.
- `scripts/`: build, check, data update, and deploy helper scripts.
- `cloudbaserc.json`: CloudBase environment and function configuration.

## Local Build

```bash
npm install
npm run build:h5
npm run check:h5
```

## Deploy

```bash
npm run build:h5
tcb hosting deploy dist -e worldcup2026-d7gfmdarw394a4109
```

Production domain:

```text
https://www.pkgamecup.cn/
```

## Collaboration Rule

Other agents should modify this GitHub repository first, then deploy to CloudBase after review. CloudBase database is the live source for user profiles, prediction rooms, predictions, and behavior events.

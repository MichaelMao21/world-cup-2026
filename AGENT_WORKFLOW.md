# Agent Workflow For PKGameCup

This document explains how another agent should work on this project.

## 1. Project Goal

This is a mobile H5 website for the 2026 FIFA World Cup.

Main features:

- Match schedule and results
- Team and venue information
- Prediction PK rooms
- WeChat sharing card
- WeChat OAuth nickname binding
- Personalized prediction result poster generation

Production domain:

```text
https://www.pkgamecup.cn/
```

## 2. Source Of Truth

Use this public GitHub repository as the main collaboration source:

```text
https://github.com/MichaelMao21/world-cup-2026
```

Private backup repository:

```text
https://github.com/MichaelMao21/pkgamecup
```

Rule:

- Code changes go to `MichaelMao21/world-cup-2026`.
- Private backup can mirror the same commits.
- User data does not go to GitHub.

## 3. Runtime Architecture

The website runs on Tencent CloudBase.

CloudBase environment:

```text
worldcup2026-d7gfmdarw394a4109
```

CloudBase is used for:

- Static hosting
- Cloud functions
- User profile data
- Prediction rooms
- Prediction records
- Event tracking
- Match result sync

GitHub is used for:

- Source code
- Static configuration
- Static match/team/venue data
- Reusable poster templates
- Documentation

Do not upload AppSecret, access tokens, private keys, exported user data, or database dumps to GitHub.

## 4. Main Files

```text
prototype.html
```

Main H5 page.

```text
js/app-config.js
```

Public frontend configuration.

```text
js/prediction-service.js
```

Prediction, PK room, profile, and CloudBase data logic.

```text
data/
```

Static data for teams, players, matches, venues, standings, and prototype payload.

```text
functions/
```

CloudBase cloud functions.

Current functions:

- `wechatShareConfig`
- `syncMatchResults`

```text
assets/poster-templates/
```

Reusable match poster templates.

## 5. Local Setup

Run:

```bash
npm install
npm run build:h5
npm run check:h5
npm run test:predictions
```

Do not commit:

- `node_modules/`
- `dist/`
- `downloads/`
- `.env`
- temporary screenshots
- local logs
- user data exports

## 6. Deploy To CloudBase

Build first:

```bash
npm run build:h5
```

Deploy static website:

```bash
tcb hosting deploy dist -e worldcup2026-d7gfmdarw394a4109
```

After deployment, verify:

```text
https://www.pkgamecup.cn/
```

## 7. Cloud Function Notes

Be careful with `wechatShareConfig`.

It depends on WeChat AppID and AppSecret.

Current public AppID:

```text
wx394b4d5d5bd16947
```

Do not commit AppSecret.

When updating cloud function code, do not overwrite cloud environment variables unless explicitly required.

## 8. WeChat Requirements

Configured domain:

```text
www.pkgamecup.cn
```

Important:

- Use `www.pkgamecup.cn`
- Do not use `pkgamecup.cn`
- Do not include `https://`
- Do not include path or port

Verification file:

```text
MP_verify_MG3DG2tDMN04zQGx.txt
```

It must remain accessible at:

```text
https://www.pkgamecup.cn/MP_verify_MG3DG2tDMN04zQGx.txt
```

Expected content:

```text
MG3DG2tDMN04zQGx
```

## 9. Poster Template Workflow

Poster templates are stored in:

```text
assets/poster-templates/
```

Each match should have its own folder:

```text
assets/poster-templates/{match-id-or-date-team-vs-team}/
```

Example:

```text
assets/poster-templates/20260704-australia-vs-egypt/
```

Each match folder should normally include:

```text
template-1.png
template-2.png
template-3.png
manifest.json
```

`manifest.json` format:

```json
{
  "matchId": "20260704-australia-vs-egypt",
  "matchLabel": "澳大利亚 VS 埃及",
  "templates": [
    {
      "id": "template-1",
      "file": "template-1.png",
      "style": "black-gold-champion"
    },
    {
      "id": "template-2",
      "file": "template-2.png",
      "style": "neon-street"
    },
    {
      "id": "template-3",
      "file": "template-3.png",
      "style": "red-blue-battle"
    }
  ]
}
```

Poster template rules:

- Upload only reusable background templates.
- Do not upload personalized user posters.
- Do not upload private user data.
- Each match should have about 3 main templates.
- Templates should leave enough clear space for dynamic user text.

Personalized poster generation should overlay:

- User nickname
- Match name
- Correct prediction count
- Correct prediction items
- Points
- Ranking or percentile if available
- QR code or entry prompt if needed

## 10. Recommended Git Workflow

For normal changes:

```bash
git pull origin master
git checkout -b your-branch-name
```

After editing:

```bash
npm run build:h5
npm run check:h5
npm run test:predictions
git add <changed-files>
git commit -m "Short description"
git push origin your-branch-name
```

Then create a pull request into:

```text
master
```

For direct small updates approved by the owner, commit to `master` and push.

## 11. Data Rules

Static data belongs in GitHub:

- Match list
- Team data
- Venue data
- Poster templates
- Static generated prototype payload

Live user data belongs in CloudBase:

- User profiles
- Nicknames
- Prediction answers
- PK rooms
- Room members
- Events
- Generated personalized posters

Do not mix these two categories.

## 12. Current Collaboration Model

Public main repository:

```text
https://github.com/MichaelMao21/world-cup-2026
```

Private backup repository:

```text
https://github.com/MichaelMao21/pkgamecup
```

Production hosting:

```text
Tencent CloudBase Hosting
```

Production database:

```text
Tencent CloudBase Database
```

Production domain:

```text
https://www.pkgamecup.cn/
```

## 13. Before Saying A Task Is Complete

Run at least:

```bash
npm run build:h5
npm run check:h5
```

For prediction or PK room changes, also run:

```bash
npm run test:predictions
```

For production changes, verify online:

```text
https://www.pkgamecup.cn/
```

If the change affects WeChat sharing, test inside WeChat, not only desktop Chrome.

# L2 Loop Runbook

This loop updates and verifies the World Cup guide project with match-aware timing, publishes low-risk data changes, and sends a Feishu report.

## Scope

- Sync completed match results.
- Enrich completed match event data when available.
- Refresh player leaderboards from ESPN statistics.
- Recalculate tournament and team statistics from match results.
- Rebuild the website data bundle.
- Build and publish the H5 site to CloudBase.
- Check H5 page contracts.
- Check the prediction-room flow.
- Write local state and daily reports.
- Send the report to Feishu when local recipient config is available.

## Trigger Rules

- The installer generates concrete system wake-up times from `data/fifa-matches.json`.
- Around 60 minutes after kickoff, it runs a half-time inspection once.
- Around 120 minutes after kickoff, it runs a full-time inspection once.
- Every 30 minutes, a lightweight catch-up wake checks whether a half-time or full-time event was missed in the last 6 hours. If nothing is due, it exits without running the full loop.
- On non-match days, it runs one daily inspection at the configured time.
- Duplicate sends are prevented through `.loop/scheduler-state.json`.
- If the match calendar changes, run `npm run loop:install` again to refresh system triggers.

## Safety Rules

- Automatic fixes are allowed only for low-risk data and delivery assets:
  - match results
  - match event data
  - player leaderboards
  - team statistics
  - generated website data
  - H5 build output
  - CloudBase publish
  - launchd scheduler installation
- Do not automatically change:
  - prediction scoring rules
  - core business logic
  - database permissions
  - login or payment behavior
  - large UI redesigns
- Any failure outside the allowed scope must be reported and left for manual handling.

## Local Configuration

Use `.loop/CONFIG.local.json` for private settings such as Feishu recipient IDs.
This file is ignored by Git.

## Manual Commands

```bash
npm run validate:data
npm run loop:daily
npm run loop:scheduler
npm run loop:install
```

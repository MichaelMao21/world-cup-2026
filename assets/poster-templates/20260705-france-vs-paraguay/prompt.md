# Poster Prompt - 法国 VS 巴拉圭

## Match
- Match ID: 20260705-france-vs-paraguay
- Match label: 法国 VS 巴拉圭
- Stage: 16强
- Venue: Philadelphia Stadium
- Match time: 2026-07-05
- Result: France wins 1-0 (Mbappé penalty)
- Key moment: Mbappé 19th World Cup goal (penalty), France advance to quarterfinals
- Winner: France

## Visual Direction
All 3 templates use Mbappé celebrating his record-breaking 19th World Cup goal as base.
Style references: diffuse-aurora (tmpl_C3), pop-art-halftone (tmpl_B3), memphis-duotone (tmpl_A3).
Each template was generated with 2 reference images: match photo + style reference.

## Reference Images
- reference-1.png: Mbappé celebrating 19th WC goal — main reference (2000x1333)
- reference-2.png: AP News Mbappé action shot
- reference-3.png: AP News celebration wide shot

## Template 1 (diffuse-aurora) — Template 2 (pop-art-halftone) — Template 3 (memphis-duotone)
See individual style descriptions in previous match templates.

## Layout Zone Guide (all 3 templates follow this structure)
- Zone 1 TOP 20%: Brand + match info header (fixed content)
- Zone 2 CENTER 48%: DYNAMIC CONTENT AREA — clean card/panel with empty placeholder rows
  → Downstream agent overlays: nickname, correct prediction items (correct only), score badge
- Zone 3 LOWER MIDDLE 12%: Headline placeholder area (dynamic text goes here)
- Zone 4 BOTTOM 20%: QR code — ALREADY EMBEDDED (real QR from pkgamecup site)

## Dynamic Text Guidance
Overlay onto Zone 2 center card:
- nickname: top label area
- correct prediction items ONLY (no wrong items): fill the empty pill rows
- correctCount + points: bottom badge area
- headline: Zone 3 area
- DO NOT overlay another QR code — it is pre-embedded in Zone 4

## QR Position
Embedded at ~78% vertical, horizontally centered, ~28% image width (white rounded-rect background).

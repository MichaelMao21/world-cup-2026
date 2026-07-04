# Poster Prompt - 阿根廷 VS 佛得角

## Match

- Match ID: 20260704-argentina-vs-cape-verde
- Match label: 阿根廷 VS 佛得角
- Stage: 32强淘汰赛
- Venue: Miami Stadium
- Match time: 2026-07-04 18:00 ET
- Result: Argentina wins (AET 2-1 / 1-1 after 90min)
- Key moment: Messi 29' — 20th career World Cup goal (all-time record)

## Visual Direction

All 3 templates use a real photo of Messi celebrating his record-breaking 20th World Cup goal
as the base layer, with an artistic style treatment applied on top.
The photo provides authenticity and context; the style treatment elevates it to a shareable poster.

## Reference Images

- reference-1.png: Main composition reference — high-res Messi celebration (2560x1440), used as base for all 3 templates
- reference-2.png: Secondary shot — Messi in action (768x432), alternate framing
- reference-3.png: Match atmosphere — Al Jazeera editorial shot, wide-angle

## Template 1 Prompt (memphis-duotone)

Style: Memphis Design + Duotone photo treatment
Photo processed as electric-blue and gold two-tone duotone. Bold Memphis geometric shapes
(triangles, circles, zigzag lines, polka dots) layered as overlays in coral red, mint green,
electric yellow. Top coral-red band + bottom cobalt-blue band. White rounded prediction card center.

## Template 2 Prompt (pop-art-halftone)

Style: Pop Art / Roy Lichtenstein + CMYK halftone treatment
Photo flattened to 4-6 bold colors, heavy CMYK halftone dot overlay in cyan on yellow base,
thick black outlines around figure silhouette. Comic-panel thick black border. Red-orange starburst
explosion header. White comic panel for prediction content. Red-yellow diagonal stripe bottom band.

## Template 3 Prompt (diffuse-aurora)

Style: Diffuse Gradient / Aurora Glassmorphism
Photo overlaid with deep navy blue + violet/magenta/electric-blue aurora color blobs. Heavy color
grading making it painterly and dreamy rather than photographic. Frosted glassmorphism card center.
Gold-to-white gradient headline text. Frosted QR placeholder bottom.

## Dynamic Text Guidance

The main website agent should overlay the following onto the center card area (middle 45%):
- nickname: top of center card, small label style
- correct prediction items: list in center card, one pill/row per item, green checkmark
- correctCount: summary badge at bottom of card (e.g. "命中 3 项")
- points: gold pill badge (e.g. "+150分")
- CTA text: below center card, 1-2 lines
- QR code: already embedded at bottom 25% — do NOT overlay another QR code

QR code is pre-embedded in all 3 templates at approx position:
  x: horizontally centered
  y: starts at ~76% of image height
  size: ~28% of image width (white rounded-rect background included)

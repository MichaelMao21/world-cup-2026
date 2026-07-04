# Poster Template Agent Brief

This document is for the agent responsible for creating poster template materials.

## 1. Collaboration Goal

The poster template agent does **not** generate final user-personalized posters.

The poster template agent only provides reusable creative materials for each match:

- Reference images
- Prompt text
- Style direction
- 3 reusable poster template options
- Template metadata

The main website agent will later use these materials to generate final personalized share posters for users based on their prediction results.

## 2. Final User Flow

1. User joins a match prediction PK.
2. User submits predictions.
3. Match finishes.
4. System calculates which prediction items the user got right.
5. System randomly selects 1 template from 3 available templates for that match.
6. System overlays personalized content onto the selected template.
7. User saves or shares the final personalized poster.

## 3. Responsibility Split

### Poster Template Agent

Responsible for:

- Designing the visual style framework for each match poster.
- Providing 3 reusable template options for each match.
- Providing reference images and generation prompts.
- Making sure templates have enough clear space for personalized text.
- Uploading all template assets to GitHub.

Not responsible for:

- User data.
- User prediction scoring.
- Final poster text generation.
- Personalized poster rendering.
- CloudBase database changes.

### Main Website Agent

Responsible for:

- Reading the uploaded template assets.
- Selecting one of the 3 templates randomly.
- Calculating the user's correct prediction items.
- Generating the final personalized share poster.
- Inserting user nickname, score, correct items, match name, and CTA.
- Ensuring the final poster can be saved and shared in WeChat.

## 4. GitHub Storage Location

Use the public main repository:

```text
https://github.com/MichaelMao21/world-cup-2026
```

Poster template folder:

```text
assets/poster-templates/
```

Each match must have its own folder:

```text
assets/poster-templates/{match-id-or-date-team-vs-team}/
```

Example:

```text
assets/poster-templates/20260704-australia-vs-egypt/
```

## 5. Required Files For Each Match

Each match folder should include:

```text
template-1.png
template-2.png
template-3.png
reference-1.png
reference-2.png
reference-3.png
prompt.md
manifest.json
```

If there are fewer reference images, still keep the naming clear:

```text
reference-main.png
reference-style.png
```

## 6. Template Requirements

Each match should normally provide 3 poster templates.

Recommended size:

```text
1080 x 1920 px
```

Format:

```text
PNG
```

The template should be a reusable background or semi-finished layout. It should **not** contain final user-specific data.

Do not include:

- User nickname
- User avatar
- User points
- Exact correct prediction count
- User ranking
- QR code that belongs to a specific user
- Private or personal data

The template may include:

- Match atmosphere
- Team visual cues
- Country flags
- Match title area
- Decorative score/result zones
- Placeholder zones
- Visual hierarchy for later text overlay

## 7. Clear Space Requirements

The final poster needs space for dynamic content.

Please reserve readable areas for:

- User nickname
- Main headline
- Correct prediction count
- Correct prediction item list
- Points or ranking
- CTA text
- QR code or entry prompt

Avoid putting important background details under these zones.

Recommended dynamic text zones:

```text
Top 20%: brand and headline
Middle 45%: match and correct prediction items
Bottom 25%: score, ranking, CTA, QR code area
```

## 8. Prompt File Format

Create a `prompt.md` file in each match folder.

Use this format:

```markdown
# Poster Prompt - 澳大利亚 VS 埃及

## Match

- Match ID: 20260704-australia-vs-egypt
- Match label: 澳大利亚 VS 埃及
- Stage: 32强赛
- Venue: Dallas Stadium
- Match time: 2026-07-04 02:00

## Visual Direction

Describe the main visual style here.

## Reference Images

- reference-1.png: describe why this image is useful
- reference-2.png: describe why this image is useful
- reference-3.png: describe why this image is useful

## Template 1 Prompt

Prompt used to generate template-1.png.

## Template 2 Prompt

Prompt used to generate template-2.png.

## Template 3 Prompt

Prompt used to generate template-3.png.

## Dynamic Text Guidance

Explain where the main website agent should overlay:

- nickname
- correct count
- correct items
- points
- CTA
```

## 9. Manifest Format

Create a `manifest.json` file in each match folder.

Example:

```json
{
  "matchId": "20260704-australia-vs-egypt",
  "matchLabel": "澳大利亚 VS 埃及",
  "stage": "32强赛",
  "venue": "Dallas Stadium",
  "matchTime": "2026-07-04 02:00",
  "templates": [
    {
      "id": "template-1",
      "file": "template-1.png",
      "style": "black-gold-champion",
      "promptFile": "prompt.md",
      "recommendedTextZones": {
        "headline": "top",
        "correctItems": "middle",
        "score": "lower",
        "cta": "bottom"
      }
    },
    {
      "id": "template-2",
      "file": "template-2.png",
      "style": "neon-street",
      "promptFile": "prompt.md",
      "recommendedTextZones": {
        "headline": "top",
        "correctItems": "middle",
        "score": "lower",
        "cta": "bottom"
      }
    },
    {
      "id": "template-3",
      "file": "template-3.png",
      "style": "red-blue-battle",
      "promptFile": "prompt.md",
      "recommendedTextZones": {
        "headline": "top",
        "correctItems": "middle",
        "score": "lower",
        "cta": "bottom"
      }
    }
  ],
  "references": [
    {
      "file": "reference-1.png",
      "note": "Main composition reference"
    },
    {
      "file": "reference-2.png",
      "note": "Color and typography reference"
    },
    {
      "file": "reference-3.png",
      "note": "Football atmosphere reference"
    }
  ]
}
```

## 10. Personalized Poster Content Logic

The main website agent will generate different final poster copy depending on the user's result.

The template agent should leave enough flexibility for these situations:

### User got 1 item correct

Example headline:

```text
有点东西，{昵称}预言命中 1 项
```

### User got 2-3 items correct

Example headline:

```text
太准了，{昵称}又预言中了 {命中数} 项
```

### User got 4+ items correct

Example headline:

```text
大神级预言，{昵称}命中 {命中数} 项
```

### User got all items correct

Example headline:

```text
封神了，{昵称}全场神预言
```

The template should support different headline lengths.

## 11. Final Poster Overlay Fields

The final poster may overlay:

```json
{
  "nickname": "阿峰",
  "matchLabel": "澳大利亚 VS 埃及",
  "correctCount": 4,
  "correctItems": [
    "上半场平局",
    "全场澳大利亚获胜",
    "全场无红牌",
    "黄牌 3-5 张"
  ],
  "points": 125,
  "beatText": "超过 92% 预测者",
  "cta": "下一场，敢来和我预测PK吗？"
}
```

Do not hard-code these values into the template image.

## 12. Upload Checklist

Before handing off to the main website agent, confirm:

- Match folder exists.
- 3 template PNG files exist.
- Reference images exist.
- `prompt.md` exists.
- `manifest.json` exists.
- Template images are 1080 x 1920 px or close to that ratio.
- Dynamic text areas are readable.
- No private user data is included.
- No final personalized result text is hard-coded.

## 13. Pull Request Or Direct Commit

Preferred workflow:

```bash
git pull origin master
git checkout -b poster-templates/{match-id}
```

Add files under:

```text
assets/poster-templates/{match-id}/
```

Then:

```bash
git add assets/poster-templates/{match-id}/
git commit -m "Add poster templates for {match label}"
git push origin poster-templates/{match-id}
```

Create a pull request into:

```text
master
```

For urgent match-day updates, direct commit to `master` is acceptable if approved by the owner.

## 14. Handoff Message Format

After uploading templates, send this to the main website agent:

```text
Match: 澳大利亚 VS 埃及
Folder: assets/poster-templates/20260704-australia-vs-egypt/
Templates: template-1.png, template-2.png, template-3.png
Prompt file: prompt.md
Manifest: manifest.json
Notes: [any important layout or overlay guidance]
```

## 15. Important Constraint

The poster template agent controls the visual style framework.

The main website agent controls the final personalized content generation.

Do not mix these two responsibilities.

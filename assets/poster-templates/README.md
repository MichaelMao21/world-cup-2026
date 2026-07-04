# Prediction Poster Templates

This folder stores match-specific poster background templates for prediction result sharing.

## Folder Convention

Use one folder per match:

```text
assets/poster-templates/{match-id-or-date-team-vs-team}/
```

Example:

```text
assets/poster-templates/20260704-australia-vs-egypt/
```

## File Convention

Each match should normally include 3 selectable poster templates:

```text
template-1.png
template-2.png
template-3.png
manifest.json
```

`manifest.json` should describe the templates:

```json
{
  "matchId": "20260704-australia-vs-egypt",
  "matchLabel": "澳大利亚 VS 埃及",
  "templates": [
    {
      "id": "template-1",
      "file": "template-1.png",
      "style": "black-gold-champion"
    }
  ]
}
```

## Important

- Do not upload user-generated posters here.
- Do not upload private user data here.
- Only upload reusable background templates.
- Final personalized posters are generated at runtime based on user prediction hits.

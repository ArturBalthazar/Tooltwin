# ToolTwin — AI service

Tiny Node/Express service that turns a tool prompt into a **structured parametric
tool spec** using OpenAI. It does *not* write CadQuery yet — it chooses an
archetype and proposes named, ranged parameters (including new ones implied by
the prompt). The frontend renders those as live sliders.

## Endpoints

- `GET /` — health check. Reports the model and whether a key is configured.
- `POST /generate` — body:
  ```json
  { "prompt": "...", "material": "petg", "mount": "handheld", "size": "m", "arm": "g1", "archetypeHint": "auto" }
  ```
  returns:
  ```json
  {
    "archetype": "gripper",
    "name": "Parallel gripper jaw",
    "summary": "...",
    "parameters": [
      { "key": "jawLength", "label": "Jaw length", "min": 30, "max": 120, "step": 1, "value": 64, "unit": "mm" }
    ]
  }
  ```

## Local run

```bash
cd ai-service
cp .env.example .env        # put your OpenAI key in .env
npm install
npm start                   # http://localhost:8081
```

## Deploy to Render

- **New → Web Service**, connect the repo.
- **Runtime:** Node. **Root Directory:** `ai-service`.
- **Build command:** `npm install`  · **Start command:** `node server.js`
- **Environment:**
  - `OPENAI_API_KEY` = your key (Secret)
  - `OPENAI_MODEL` = `gpt-4o-mini` (optional)
  - `ALLOWED_ORIGINS` = your site origin, e.g. `https://tooltwin-dun.vercel.app` (or `*` while testing)
- Free instance is fine (note: free instances sleep and cold-start in ~30–60 s).

The resulting URL must match `website/config.js` (`AI_SERVICE_URL`). Naming the
service **`tooltwin-ai`** yields `https://tooltwin-ai.onrender.com`, which is what
the config already expects.

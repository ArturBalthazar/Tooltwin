# ToolTwin — CAD service

FastAPI wrapper around (placeholder) CadQuery recipes. Builds a parametric solid
for the chosen archetype, exports **STL** (via CadQuery) and **GLB** (STL→GLB via
trimesh), and returns both inline (base64) with print stats.

Stateless & synchronous — the browser holds all state. No Supabase/storage.

> The CadQuery recipes in `recipes.py` are deliberately simple placeholders.
> The real, prompt-driven geometry is a later targeted task.

## Endpoints

- `GET /` — health check.
- `POST /build` — body:
  ```json
  { "archetype": "gripper", "params": { "jawLength": 64, "opening": 44 }, "material": "petg", "size": "m" }
  ```
  returns:
  ```json
  { "stl": "<base64>", "glb": "<base64>", "stats": { "bbox": "...", "volume_cm3": 12.3, "mass_g": 15.6, "print": "~1h 38m · 16 g", "triangles": 1234 } }
  ```

## Local run

Needs a Python env with CadQuery installed (OCCT is heavy; Docker is easiest):

```bash
cd cad-service
docker build -t tooltwin-cad .
docker run -p 8000:8000 tooltwin-cad
# http://localhost:8000/
```

Or with a local CadQuery env:
```bash
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

## Deploy to Render (Docker)

- **New → Web Service**, connect the repo.
- **Runtime:** Docker. **Root Directory:** `cad-service`.
- **Dockerfile Path:** `./Dockerfile` (build context is `cad-service/`).
- **Instance type:** **Starter** or larger recommended — OCCT boolean/fillet ops
  can OOM the 512 MB free tier.
- **Environment:** `ALLOWED_ORIGINS` = your site origin (or `*` while testing).

Name the service **`tooltwin-cad`** so its URL is `https://tooltwin-cad.onrender.com`,
which is what `website/config.js` (`CAD_SERVICE_URL`) already expects.

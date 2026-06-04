"""
ToolTwin CadQuery build service.

POST /build { archetype, params, material, size } -> { stl, glb, stats }

- Runs a (placeholder) CadQuery recipe for the archetype.
- Exports STL via CadQuery, converts STL -> GLB via trimesh.
- Returns both files base64-encoded inline (tools are small), plus print stats.

Stateless and synchronous: the browser holds all state. No Supabase, no storage
bucket — unlike the Petwheels service this is patterned on — because ToolTwin
tools are tiny and build fast.
"""
from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path

import trimesh
import cadquery as cq
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import recipes

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

# g/cm^3 — keep in sync with the frontend MATERIALS table.
DENSITY = {
    "petg": 1.27, "pla": 1.24, "abs": 1.04,
    "nylon": 1.14, "tpu": 1.21, "alu": 2.70,
}
PRINT_RATE_G_PER_H = 9.5

app = FastAPI(title="ToolTwin CAD service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BuildRequest(BaseModel):
    archetype: str = "gripper"
    params: dict | None = None
    material: str = "petg"
    size: str = "m"


@app.get("/")
def health():
    return {"service": "tooltwin-cad", "status": "ok", "archetypes": list(recipes.BUILDERS)}


@app.post("/build")
def build(req: BuildRequest):
    work = Path(tempfile.mkdtemp(prefix="tooltwin-"))
    try:
        solid = recipes.build(req.archetype, req.params or {})

        stl_path = work / "tool.stl"
        glb_path = work / "tool.glb"
        cq.exporters.export(solid, str(stl_path), exportType="STL", tolerance=0.05)

        # STL -> GLB for the web viewer / sim asset.
        mesh = trimesh.load(str(stl_path), force="mesh")
        mesh.export(str(glb_path))

        # stats from the tessellated mesh
        ext = mesh.extents  # [x, y, z] mm
        vol_cm3 = abs(float(mesh.volume)) / 1000.0
        density = DENSITY.get(req.material, 1.27)
        mass_g = vol_cm3 * density
        hours = mass_g / PRINT_RATE_G_PER_H
        h, mn = int(hours), int(round((hours - int(hours)) * 60))

        stats = {
            "bbox": f"{ext[0]:.0f}×{ext[1]:.0f}×{ext[2]:.0f} mm",
            "volume_cm3": round(vol_cm3, 1),
            "mass_g": round(mass_g, 1),
            "print": f"~{h}h {mn}m · {mass_g:.0f} g",
            "triangles": int(len(mesh.faces)),
        }

        return {
            "stl": base64.b64encode(stl_path.read_bytes()).decode("ascii"),
            "glb": base64.b64encode(glb_path.read_bytes()).decode("ascii"),
            "stats": stats,
        }
    except Exception as e:  # noqa: BLE001
        return {"error": f"{type(e).__name__}: {e}"}
    finally:
        import shutil
        shutil.rmtree(work, ignore_errors=True)

"""
PLACEHOLDER CadQuery recipes — one per archetype.

These are intentionally simple parametric solids that mirror the parameter keys
used by the frontend's live preview, so the downloaded STL/GLB roughly matches
what the user tuned on screen. The *real*, carefully-modeled, prompt-driven
CadQuery generation is a later, targeted task — this is the foundation/plumbing.

Each builder takes a dict of params (millimetres) and returns a CadQuery solid.
Unknown/extra params (e.g. ones the AI invented) are simply ignored here for now.
"""
from __future__ import annotations

import cadquery as cq


def _g(p: dict, key: str, default: float) -> float:
    try:
        return float(p.get(key, default))
    except (TypeError, ValueError):
        return float(default)


def build_gripper(p: dict):
    jaw_len = _g(p, "jawLength", 64)
    jaw_wid = _g(p, "jawWidth", 28)
    opening = _g(p, "opening", 44)
    finger = _g(p, "fingerThk", 9)
    base_d = opening + 2 * finger + 8

    base = cq.Workplane("XY").box(jaw_wid, base_d, 16)
    off = opening / 2 + finger / 2
    f1 = (cq.Workplane("XY").box(jaw_wid, finger, jaw_len)
          .translate((0, off, jaw_len / 2 + 8)))
    f2 = f1.mirror("XZ")
    return base.union(f1).union(f2)


def build_hook(p: dict):
    shank = _g(p, "shank", 90)
    hook_r = _g(p, "hookR", 26)
    bar = _g(p, "barThk", 11)
    tip = _g(p, "tipLen", 16)

    stem = cq.Workplane("XY").circle(bar / 2).extrude(shank)
    # half-torus arc for the hook, swept by revolving a circle about the arc center
    arc = (cq.Workplane("XZ").center(hook_r, shank)
           .circle(bar / 2).revolve(180, (-hook_r, 0, 0), (-hook_r, 1, 0)))
    tip_cyl = (cq.Workplane("XY").circle(bar / 2)
               .extrude(tip).translate((2 * hook_r, shank - tip, 0)))
    try:
        return stem.union(arc).union(tip_cyl)
    except Exception:
        return stem.union(tip_cyl)


def build_scraper(p: dict):
    blade_len = _g(p, "bladeLen", 72)
    blade_wid = _g(p, "bladeWid", 54)
    blade_thk = _g(p, "bladeThk", 3)
    handle_len = _g(p, "handleLen", 60)

    handle = cq.Workplane("XY").box(blade_wid * 0.42, handle_len, 14)
    blade = (cq.Workplane("XY").box(blade_wid, blade_len, blade_thk)
             .translate((0, handle_len / 2 + blade_len / 2, 0)))
    return handle.union(blade)


def build_probe(p: dict):
    length = _g(p, "length", 120)
    shaft = _g(p, "shaftDia", 10)
    tip = _g(p, "tipDia", 2.5)
    collar = _g(p, "collarDia", 22)

    base = cq.Workplane("XY").circle(collar / 2).extrude(12)
    body = (cq.Workplane("XY").circle(shaft / 2)
            .workplane(offset=length).circle(max(tip, 0.4) / 2).loft(combine=True)
            .translate((0, 0, 12)))
    return base.union(body)


BUILDERS = {
    "gripper": build_gripper,
    "hook": build_hook,
    "scraper": build_scraper,
    "probe": build_probe,
}


def build(archetype: str, params: dict):
    fn = BUILDERS.get(archetype, build_gripper)
    return fn(params or {})

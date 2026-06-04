# ToolTwin

**Design tools for robots. Train robots to use them.**

A platform where you describe a tool in plain language and get a parametric,
3D-printable, simulation-ready "twin" — then train a robot to use it in
simulation (sim2real), all in one place.

An **Omnipresent Robotics** platform, in partnership with **AgiBot**, built on
the open [Genie Sim](https://github.com/AgibotTech/genie_sim) simulation stack.

---

## Status

This repo currently contains the **front-end prototype** (UI/UX) of the platform.
The CadQuery generation backend, the LLM "bot", and the real Isaac Sim / Genie Sim
training pipeline are **not yet implemented** — they are represented by believable
client-side simulations so the full experience can be reviewed and iterated on first.

### What's real vs. simulated (today)

| Area | Status |
| --- | --- |
| Brand, layout, all UI/UX | Real |
| Parametric 3D tool in the viewport | Real — built live from Babylon.js primitives that rebuild as you drag parameters |
| STL / GLB / `.py` downloads | Real files exported from the live mesh (STL & GLB) and a templated CadQuery script |
| "LLM writing CadQuery" generation log | **Simulated** (scripted animation; keyword-only archetype detection) |
| Training Studio run (metrics, sim2real) | **Simulated** (ramping numbers on a timer; no Isaac Sim) |

The seams are drawn deliberately so the real backend pieces drop into the obvious
slots (the generate function, the source readout, the training job).

## The two products

1. **Tool Foundry** — Describe → Tune → Export. A 3D viewport (left) plus a guided
   stepper (right). Four tool archetypes (gripper, hook, scraper, probe), exposed
   parameters (material, mounting, size, target arm), and live parametric tuning.
2. **Training Studio** — Robot → Task → Train. The "human layer" over a Genie-Sim-style
   sim2real pipeline: pick AgiBot G1/G2, attach the tool you just made (or train robot-only),
   describe a task, set domain randomization + policy, launch, and monitor the run.

## Run locally

The site is static (vanilla HTML/CSS/JS, no build step) but must be served over HTTP
so Babylon's `.glb`/`.env` assets load (`file://` won't work).

```bash
cd website
python -m http.server 5180
# open http://localhost:5180/
```

On Windows, `startToolTwin.bat` serves the project root on port 5180 and opens
`http://localhost:5180/website/`.

## Layout

```
website/
├─ index.html      single-page site
├─ styles.css      all styling (brand: charcoal ink + vibrant green)
├─ script.js       Babylon parametric tool builder + Foundry + Training Studio
└─ assets/         ToolTwin logos + favicon
assets/            source logo files
```

## Tech

- [Babylon.js](https://www.babylonjs.com/) — 3D viewport + STL/GLB export
- Fonts: Space Grotesk (headings), Inter (body), JetBrains Mono (code/readouts)
- Planned backend: an LLM that emits [CadQuery](https://cadquery.readthedocs.io/)
  scripts, run in a sandboxed worker; training on NVIDIA Isaac Sim / Genie Sim.

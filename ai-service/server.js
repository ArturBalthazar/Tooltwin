/**
 * ToolTwin AI service.
 *
 * One job for now: turn a natural-language tool prompt + a few UI parameters
 * into a STRUCTURED, parametric tool spec the frontend can render as live
 * sliders and (later) hand to the CadQuery build service.
 *
 * It does NOT write CadQuery yet — that comes later, carefully and per-archetype.
 * Today it does the genuinely useful "AI interpreting" part: choose an archetype
 * and propose named, ranged parameters (including new ones implied by the prompt).
 *
 * The OpenAI key is read from process.env.OPENAI_API_KEY and NEVER leaves the
 * server. Deploy on Render; point the frontend at it via website/config.js.
 */
'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const PORT = process.env.PORT || 8081;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ALLOWED = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());

// Lazily construct the client: the SDK throws if the key is missing, but we
// still want the service to boot (health check, clear /generate error) without one.
let _openai = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const app = express();
app.use(cors({ origin: ALLOWED.includes('*') ? true : ALLOWED }));
app.use(express.json({ limit: '512kb' }));

/* ---- canonical parameter sets ----------------------------------------------
 * These keys MUST be kept verbatim so the frontend's live 3D preview (which is
 * keyed to them) keeps working. The model may tweak each `value` to fit the
 * prompt and may APPEND up to 2 extra params (which only matter to the future
 * CAD recipe; the preview ignores keys it doesn't know).
 * ------------------------------------------------------------------------- */
const CANONICAL = {
  gripper: [
    { key: 'jawLength', label: 'Jaw length', min: 30, max: 120, step: 1, value: 64, unit: 'mm' },
    { key: 'jawWidth', label: 'Jaw width', min: 12, max: 60, step: 1, value: 28, unit: 'mm' },
    { key: 'opening', label: 'Opening (gap)', min: 8, max: 90, step: 1, value: 44, unit: 'mm' },
    { key: 'fingerThk', label: 'Finger thickness', min: 4, max: 16, step: 0.5, value: 9, unit: 'mm' },
    { key: 'gripTeeth', label: 'Grip ridges', min: 0, max: 8, step: 1, value: 4, unit: '' },
  ],
  hook: [
    { key: 'shank', label: 'Shank length', min: 40, max: 160, step: 1, value: 90, unit: 'mm' },
    { key: 'hookR', label: 'Hook radius', min: 12, max: 55, step: 1, value: 26, unit: 'mm' },
    { key: 'barThk', label: 'Bar diameter', min: 5, max: 20, step: 0.5, value: 11, unit: 'mm' },
    { key: 'tipLen', label: 'Tip length', min: 6, max: 40, step: 1, value: 16, unit: 'mm' },
  ],
  scraper: [
    { key: 'bladeLen', label: 'Blade length', min: 30, max: 120, step: 1, value: 72, unit: 'mm' },
    { key: 'bladeWid', label: 'Blade width', min: 24, max: 90, step: 1, value: 54, unit: 'mm' },
    { key: 'bladeThk', label: 'Blade thickness', min: 1, max: 8, step: 0.5, value: 3, unit: 'mm' },
    { key: 'handleLen', label: 'Handle length', min: 30, max: 110, step: 1, value: 60, unit: 'mm' },
  ],
  probe: [
    { key: 'length', label: 'Probe length', min: 50, max: 200, step: 1, value: 120, unit: 'mm' },
    { key: 'shaftDia', label: 'Shaft diameter', min: 4, max: 18, step: 0.5, value: 10, unit: 'mm' },
    { key: 'tipDia', label: 'Tip diameter', min: 1, max: 6, step: 0.25, value: 2.5, unit: 'mm' },
    { key: 'collarDia', label: 'Collar diameter', min: 12, max: 40, step: 1, value: 22, unit: 'mm' },
  ],
};

const TOOL_SPEC_SCHEMA = {
  name: 'tool_spec',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['archetype', 'name', 'summary', 'parameters'],
    properties: {
      archetype: { type: 'string', enum: ['gripper', 'hook', 'scraper', 'probe'] },
      name: { type: 'string', description: 'Short human title, e.g. "Parallel gripper jaw".' },
      summary: { type: 'string', description: 'One sentence on what the tool does and how it was sized.' },
      parameters: {
        type: 'array',
        description: 'The canonical params for the chosen archetype (keys verbatim), values tuned to the prompt, plus up to 2 extra params.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'label', 'min', 'max', 'step', 'value', 'unit'],
          properties: {
            key: { type: 'string' },
            label: { type: 'string' },
            min: { type: 'number' },
            max: { type: 'number' },
            step: { type: 'number' },
            value: { type: 'number' },
            unit: { type: 'string' },
          },
        },
      },
    },
  },
};

function systemPrompt() {
  return [
    'You are ToolTwin\'s CAD parameter designer. ToolTwin turns a plain-language',
    'request for a robot end-effector tool into a parametric, 3D-printable model.',
    '',
    'Pick exactly ONE archetype that best matches the request:',
    '- gripper : a parallel two-finger jaw for picking/holding objects',
    '- hook    : a hook for pulling handles, latches, loops',
    '- scraper : a flat blade/spatula for scraping, wiping, clearing',
    '- probe   : a slim shaft/pointer for reaching, poking, inspecting',
    '',
    'For the chosen archetype you MUST return its canonical parameters with their',
    'keys EXACTLY as given below (the live 3D preview is keyed to them). Adjust each',
    "`value` so the tool fits the user's request, staying within [min,max]. Keep",
    'min/max/step/unit as given unless the request truly demands otherwise. You MAY',
    'append up to 2 EXTRA parameters that the request implies (e.g. a wall thickness,',
    'a chamfer, a bore diameter); give them sensible min/max/step/value/unit.',
    '',
    'Canonical parameters:',
    JSON.stringify(CANONICAL, null, 2),
    '',
    'Return ONLY the structured tool_spec. Be decisive; do not ask questions.',
  ].join('\n');
}

app.get('/', (_req, res) => {
  res.json({ service: 'tooltwin-ai', status: 'ok', model: MODEL, hasKey: !!process.env.OPENAI_API_KEY });
});

app.post('/generate', async (req, res) => {
  const { prompt = '', material = 'petg', mount = 'handheld', size = 'm', arm = 'g1', archetypeHint = 'auto' } = req.body || {};
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured on the server' });
  }
  try {
    const userMsg = [
      `Request: ${prompt || '(no prompt given — design a sensible default tool)'}`,
      `Material: ${material}`,
      `Mounting: ${mount}`,
      `Size class: ${size}`,
      `Target robot arm: ${arm}`,
      archetypeHint && archetypeHint !== 'auto' ? `Forced archetype: ${archetypeHint}` : 'Archetype: choose the best fit',
    ].join('\n');

    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_schema', json_schema: TOOL_SPEC_SCHEMA },
    });

    const spec = JSON.parse(completion.choices[0].message.content);
    spec.tokens = completion.usage?.total_tokens ?? null;
    res.json(spec);
  } catch (e) {
    console.error('generate failed:', e.message);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => console.log(`tooltwin-ai listening on :${PORT} (model ${MODEL})`));

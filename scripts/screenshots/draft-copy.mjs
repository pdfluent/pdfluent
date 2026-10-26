// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Draft the screenshot headlines and captions from store/screenshots/1.1.0/
// copy-brief.json. External text is not written by hand or by a coding
// assistant (the project's rule on published text): it comes from the model
// named in PDFLUENT_COPY_MODEL, then goes through the Humanizer pass, then Jasper approves it.
// The output is always `draft: true`; tests/screenshots-pipeline.test.ts and
// compose.mjs both refuse a marketing run on a draft.
//
//   node scripts/screenshots/draft-copy.mjs
// PDFLUENT_COPY_MODEL: the OpenRouter model id for external text (see the project's
// memory on published text); no default, so the choice is never made by the script.
// Key: OPENROUTER_API_KEY in the environment, else the keychain item
// `security find-generic-password -a pdfluent -s OPENROUTER_API_KEY -w`.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'store', 'screenshots', '1.1.0');
const MODEL = process.env.PDFLUENT_COPY_MODEL;
if (!MODEL) throw new Error('set PDFLUENT_COPY_MODEL to the OpenRouter model id for external text');

function key() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const r = spawnSync('security', ['find-generic-password', '-a', 'pdfluent', '-s', 'OPENROUTER_API_KEY', '-w'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('no OPENROUTER_API_KEY in the environment or the keychain');
  return r.stdout.trim();
}

const brief = JSON.parse(readFileSync(path.join(DIR, 'copy-brief.json'), 'utf8'));
const prompt = [
  'Write App Store and Microsoft Store screenshot copy for PDFluent, a desktop PDF editor.',
  'Rules:', ...brief.rules.map((r) => `- ${r}`),
  'Frames (id: what the screenshot shows, facts you may use):',
  JSON.stringify(Object.fromEntries(Object.entries(brief.frames).map(([id, f]) => [id, { shows: f.shows, facts: f.facts }])), null, 1),
  'Answer with JSON only: {"<id>": {"headline": "...", "sub": "...", "caption": "..."}, ...} for every id.',
].join('\n');

const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.4 }),
});
if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
const body = await res.json();
const frames = JSON.parse(body.choices[0].message.content.replace(/^```json\s*|\s*```$/g, ''));
for (const [id, f] of Object.entries(brief.frames)) {
  if (!frames[id]) throw new Error(`the model returned nothing for frame ${id}`);
  if (f.blockedBy) frames[id].blockedBy = f.blockedBy;
  if ((frames[id].caption ?? '').length > 200) frames[id].caption = `OVER-LIMIT ${frames[id].caption.length}: ${frames[id].caption}`;
}
const out = {
  draft: true,
  source: `${MODEL} via OpenRouter, ${new Date().toISOString().slice(0, 10)}`,
  humanizer: 'pending',
  claims: 'unchecked: each headline and caption still needs its CLAIMS.md ID (or no claim in it) before it ships',
  frames,
};
writeFileSync(path.join(DIR, 'copy.json'), `${JSON.stringify(out, null, 2)}\n`);
process.stdout.write(`wrote copy.json (draft) with ${Object.keys(frames).length} frames\n`);

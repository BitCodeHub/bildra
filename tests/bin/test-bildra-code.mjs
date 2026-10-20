#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-bildra-code.mjs — Bildra's California code check (app/code-check.js, app/code-rules-ca.js).
 *   1. The rules: every number a rule checks is written in its wording, every rule has a source that exists (owner,
 *      2026-10-20: "do not make up").
 *   2. A building made with Bildra's own tools: a default straight stair (passes), a 24" spiral stair (fails its 26"
 *      width), a 36" guard (fails the 42" of R321.1.2) and a default guard (42": passes).
 *   3. The showcase house with its rooms named by use: room sizes and ceilings pass; the egress door and the bedroom's
 *      escape window are "confirm", never "pass" (the model holds sizes, not clear openings); the garage door is no
 *      egress door.
 *   node tests/bin/test-bildra-code.mjs [--verbose]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// under npm test: the mirror (public_html/…/dev, fixtures/); run from a clone: tests/bin → the repo's app/ and fixtures/
const MIRROR = path.join(ROOT, 'public_html/assets/apps/bimcraft/dev');
const REPO = fs.existsSync(path.join(ROOT, 'app')) ? ROOT : path.join(ROOT, '..');
const APP = fs.existsSync(MIRROR) ? MIRROR : path.join(REPO, 'app');
const FIXTURES = fs.existsSync(path.join(ROOT, 'fixtures/showcase')) ? path.join(ROOT, 'fixtures') : path.join(REPO, 'fixtures');
const VERBOSE = process.argv.includes('--verbose');
const imp = (f) => import(pathToFileURL(path.join(APP, f)).href);
(await imp('i18n.js')).init({ strings: JSON.parse(fs.readFileSync(path.join(APP, 'lang/en.json'), 'utf8')) });
const WebIFC = await imp('ifc/api.js');
const { IfcModel } = await imp('ifc-model.js');
const { propertyIndex } = await imp('ifc-props.js');
const { lengthUnitMm, ids } = await imp('ifc-util.js');
const { gatherModel, runCodeCheck, wholesOf, roomKind, ftIn } = await imp('code-check.js');
const { RULES, SOURCES } = await imp('code-rules-ca.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (VERBOSE) console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

console.log('== The rules');
const words = (n) => {
  const whole = Math.floor(n), frac = n - whole;   // only exact quarters are written as fractions (5.7 stays 5.7)
  const f = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4' }[frac];
  return f ? `${whole} ${f}` : String(n);
};
for (const r of RULES) {
  ok(r.sources.length >= 1 && r.sources.every((k) => SOURCES[k]?.url?.startsWith('https://')), `${r.id}: has sources that exist`);
  for (const [name, n] of Object.entries(r.limits)) ok(r.rule.includes(words(n)), `${r.id}: ${name} = ${n} is written in its wording ("${words(n)}")`);
  ok(/^R3\d\d(\.\d+)*$/.test(r.section), `${r.id}: section ${r.section} is a 2025 CRC chapter 3 number`);
}
ok(new Set(RULES.map((r) => r.id)).size === RULES.length, 'rule ids are unique');
ok(roomKind('Master Bath') === 'wet' && roomKind('Master Bedroom') === 'sleeping' && roomKind('Room 1') === null && roomKind('101', 'Living room') === 'habitable' && roomKind('Hallway') === 'hallway', 'room kinds from names (wet before sleeping; "Room 1" is unknown)');
ok(ftIn(196.85) === '7 3/4 in.' && ftIn(2133.6) === '7 ft 0 in.' && ftIn(1066.8) === '3 ft 6 in.', 'feet and inches');

async function check(bytes) {
  const im = await quiet(() => IfcModel.create(WebIFC, null));
  const model = await quiet(() => im.load(bytes));
  const api = im.api, mid = model.modelID;
  const aggregates = ids(api, mid, 'IFCRELAGGREGATES').map((r) => { const l = api.GetLine(mid, r, false); return [l.RelatingObject.value, (l.RelatedObjects || []).map((h) => h.value)]; });
  const data = gatherModel({ ix: propertyIndex(WebIFC, api, mid, model), spaceIx: propertyIndex(WebIFC, api, mid, model, { spaces: true }), model, unitMm: lengthUnitMm(api, mid), line: (id) => api.GetLine(mid, id, false), aggregates, wholes: wholesOf(api, mid, aggregates) });
  return Object.fromEntries(runCodeCheck(data).rules.map((r) => [r.rule.id, r]));
}
const rulesOf = async (bytes) => { const r = await check(bytes); return r; };

console.log('== A building drawn with Bildra\'s tools');
{
  const N = await imp('new-model.js'), { IfcEditor } = await imp('ifc-edit.js'), S = await imp('res-stair.js'), R = await imp('res-railing.js');
  const text = N.newBuilding({ name: 'Code test', levels: N.stackLevels(2, 2743.2, (i) => 'Level ' + (i + 1)), author: 'Test', fileName: 'x.ifc', now: new Date('2026-10-20T12:00:00Z') });
  const engine = await quiet(() => IfcModel.create(WebIFC, null)); await quiet(() => engine.load(new TextEncoder().encode(text)));
  const ed = new IfcEditor(WebIFC, engine);
  const lvl = ed.placer().info().storeys[0];
  const lg = engine.api.GetLine(ed.mid, lvl.id, false).GlobalId.value;
  S.placeStair({ level: lg, start: [0, 0], angle: 0, kind: 'straight' })(ed);
  S.placeStair({ level: lg, start: [5000, 0], angle: 0, kind: 'spiral', width: 24 * 25.4 })(ed);
  R.placeRailing({ level: lg, points: [[0, 6000], [3000, 6000]], kind: 'guard', height: 36 * 25.4 })(ed);
  R.placeRailing({ level: lg, points: [[0, 7000], [3000, 7000]] })(ed);
  ok(R.GUARD_HEIGHT === 42 * 25.4, 'a drawn guard is 42" by default (R321.1.2)');
  const r = await rulesOf(ed.save());
  const st = (id) => r[id].items.map((i) => i.status).sort().join(',');
  ok(st('stair-riser') === 'pass' && r['stair-riser'].items[0].measured === '7 3/4 in.', 'the default stair: risers 7 3/4 in. pass');
  ok(st('stair-tread') === 'pass' && st('stair-width') === 'pass' && st('stair-rise') === 'pass' && st('stair-handrail') === 'pass', 'its treads, width, rise and handrail pass');
  ok(st('spiral') === 'fail' && /width 2 ft 0 in/.test(r.spiral.items[0].why), 'the 24" spiral stair fails the 26" width');
  ok(st('guard-height') === 'fail,pass', 'guards: the 36" one fails, the 42" one passes');
  ok(r['handrail-height'].items.length >= 2 && r['handrail-height'].items.every((i) => i.status === 'pass' && i.measured === '3 ft 0 in.'), 'handrails at 36" pass');
  ok(r.spiral.items[0].keys.length > 0, 'a stair\'s result selects its parts when clicked');
  ok(st('egress-door') === 'check' && /No doors/.test(r['egress-door'].items[0].why), 'no doors: the egress door is "confirm", not a pass');
}

console.log('== The showcase house, rooms named by use');
{
  const src = fs.readFileSync(path.join(FIXTURES, 'showcase/bimcraft-house.ifc'), 'latin1')
    .replace("'Room 1'", "'Living room'").replace("'Room 2'", "'Bedroom 1'").replace("'Room 3'", "'Bath'").replace("'Room 4'", "'Hall'").replace("'Room 5'", "'Kitchen'");
  const r = await rulesOf(new Uint8Array(Buffer.from(src, 'latin1')));
  const st = (id) => r[id].items.map((i) => i.status).sort().join(',');
  ok(st('room-area') === 'pass,pass' && st('room-dimension') === 'pass,pass', 'the bedroom and living room pass area and size (the kitchen is excepted)');
  ok(st('ceiling') === 'pass,pass,pass,pass,pass' && r.ceiling.items.some((i) => /6 ft 8 in/.test(i.measured)), 'five ceilings pass; the bath against 6 ft 8 in.');
  ok(st('hallway') === 'pass', 'the hall is wider than 3 ft');
  ok(st('egress-door') === 'check' && !/Garage/.test(r['egress-door'].items[0].label), 'the egress door is "confirm" (clear width), and it is not the garage door');
  ok(st('escape-opening') === 'check' && /Double hung/.test(r['escape-opening'].items[0].why) && /sill 1 ft 8 in/.test(r['escape-opening'].items[0].measured), 'the bedroom\'s escape window: the double-hung, sill 20 in., to confirm');
  ok(st('smoke-alarm') === 'check', 'no smoke alarms in the model: "confirm", never a pass');
}
{
  const r = await rulesOf(new Uint8Array(fs.readFileSync(path.join(FIXTURES, 'showcase/bimcraft-house.ifc'))));
  ok(r['room-area'].items.length === 0 && r.ceiling.items.length === 0, 'rooms named "Room 1"… are not judged');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

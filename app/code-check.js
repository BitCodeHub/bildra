/* SPDX-License-Identifier: Apache-2.0 */
/**
 * code-check.js — runs the California code rules (code-rules-ca.js) on an open model. No DOM: tests/bin/test-bildra-code.mjs
 * runs it in Node.
 *
 *   const data = gatherModel({ ix, spaceIx, model, unitMm, line })   what the rules read, once per run
 *     ix / spaceIx = ifc-props.js propertyIndex for the elements / the spaces; model = IfcModel.load() result (batches are
 *     in metres, Y up); unitMm = mm per file length unit; line(expressID) → the IFC line (entity attributes such as
 *     OverallWidth or NumberOfRisers), or null where there is no API (then only properties count); aggregates = [[whole,
 *     [parts]]] from IfcRelAggregates (a stair's flights and railings); wholes = wholesOf(api, mid, aggregates) (below).
 *   const report = runCodeCheck(data[, { rules }])
 *     → { edition, rules: [{ rule, items: [{ key, label, status: 'pass'|'fail'|'check', measured, why }], counts }],
 *         notChecked, rooms: { judged, unknown } }
 *
 * status: 'pass' — the model meets the rule; 'fail' — it does not; 'check' — the model cannot decide (why says what to
 * confirm). Nothing is guessed: a value the model does not hold gives 'check', never a pass.
 */
import { RULES, NOT_CHECKED, ROOM_KINDS, EDITION, IN, FT } from './code-rules-ca.js';

const SQFT = FT * FT;   // mm² per square foot

/** Room kind from its names: whole-word match, first kind listed wins (wet before sleeping: "master bath"). */
export function roomKind(...names) {
  const text = ' ' + names.filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  for (const { kind, words } of ROOM_KINDS) if (words.some((w) => text.includes(' ' + w + ' '))) return kind;
  return null;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v !== null && v !== undefined ? n : null; };
const yes = (v) => v === 'Yes' || v === true || v === '.T.';

/** Every element's and space's outline (metres, Y up) and, for spaces, the floor area (m²) from the mesh. */
function shapes(model) {
  const box = new Map(), up = new Map();
  for (const b of model.batches) {
    const E = b.elems, P = b.positions, I = b.indices;
    for (let r = 0; r < E.ids.length; r++) {
      const k = E.ids[r];
      let bb = box.get(k);
      if (!bb) box.set(k, (bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]));
      for (let v = E.v0[r] * 3, end = (E.v0[r] + E.vn[r]) * 3; v < end; v += 3) for (let c = 0; c < 3; c++) { const x = P[v + c]; if (x < bb[c]) bb[c] = x; if (x > bb[c + 3]) bb[c + 3] = x; }
      if (!b.space) continue;
      // projected area of the faces looking up (the floor, seen from inside: its normal may point either way, so
      // count faces looking down too and halve: a room's floor and ceiling project to the same plan)
      let a = 0;
      for (let t = E.t0[r] * 3, end = (E.t0[r] + E.tn[r]) * 3; t < end; t += 3) {
        const i0 = I[t] * 3, i1 = I[t + 1] * 3, i2 = I[t + 2] * 3;
        const ux = P[i1] - P[i0], uz = P[i1 + 2] - P[i0 + 2], vx = P[i2] - P[i0], vz = P[i2 + 2] - P[i0 + 2];
        a += Math.abs(ux * vz - uz * vx) / 2;
      }
      up.set(k, (up.get(k) || 0) + a / 2);
    }
  }
  return { box, area: up };
}

/** What the rules read: elements and spaces with their names, values and outlines. */
export function gatherModel({ ix, spaceIx, model, unitMm = 1000, line = null, aggregates = [], wholes = new Map() }) {
  const { box, area } = shapes(model);
  const L = (v) => (num(v) === null ? null : num(v) * unitMm);   // file length → mm
  const attr = (id, name) => { if (!line) return null; try { const l = line(id); const v = l?.[name]; return v && typeof v === 'object' && 'value' in v ? v.value : v ?? null; } catch (e) { return null; } };
  const item = (x, id, isSpace) => {
    const key = (x.keyBase || 0) + id;
    const bb = box.get(key) || null;
    const v = (f) => x.value(f, id);
    return {
      id, key, cls: v('cls'), name: v('name') || '', longname: v('longname') || '', objtype: v('objtype') || '', predefined: String(v('predefined') || ''),
      storey: model.storeyOf.get(id) ?? null, v, attr: (n) => attr(id, n), L,
      // outline in mm: x, y (up), z
      box: bb && bb[0] !== Infinity ? bb.map((m) => m * 1000) : null,
      area: isSpace ? (area.get(key) ?? null) : null,   // m²
    };
  };
  const elements = ix.ids.map((id) => item(ix, id, false));
  const spaces = spaceIx ? spaceIx.ids.map((id) => item(spaceIx, id, true)) : [];
  // the stair each flight or railing belongs to (IfcRelAggregates)
  const parent = new Map();
  for (const [whole, parts] of aggregates) for (const p of parts) parent.set(p, whole);
  // a whole that has no shape of its own (a stair holding its flights) is not in the index: its class, type and
  // properties come from `wholes` (expressID → { cls, name, predefined, props: { 'p:<set>.<name>': value } })
  const known = new Set(ix.ids);
  for (const [id, w] of wholes) {
    if (known.has(id)) continue;
    elements.push(item({ keyBase: ix.keyBase, value: (f, _id) => (f === 'cls' ? w.cls : f === 'name' ? w.name : f === 'predefined' ? w.predefined : w.props[f]) }, id, false));
  }
  const byId = new Map(elements.map((e) => [e.id, e]));
  return { elements, spaces, parent, byId, storeys: model.storeys, unitMm };
}

// ---- helpers over outlines (mm, Y up) ----
const h = (b) => b[4] - b[1];
const plan = (b) => [b[3] - b[0], b[5] - b[2]];
const overlaps = (a, b, pad = 0) => a[0] - pad <= b[3] && b[0] - pad <= a[3] && a[2] - pad <= b[5] && b[2] - pad <= a[5] && a[1] - pad <= b[4] && b[1] - pad <= a[4];
const inside = (p, b) => p[0] >= b[0] && p[0] <= b[3] && p[1] >= b[1] && p[1] <= b[4] && p[2] >= b[2] && p[2] <= b[5];
const centre = (b) => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
/** A space's outline is its shape when the floor fills the box (a rectangle, within 3 %). */
const rectangular = (s) => s.box && s.area !== null && Math.abs(s.area * 1e6 - plan(s.box)[0] * plan(s.box)[1]) <= 0.03 * plan(s.box)[0] * plan(s.box)[1];

/** 7 ft 6 in. style: mm → feet and inches, to the nearest 1/8 in. */
export function ftIn(mm) {
  const eighths = Math.round(mm / IN * 8);
  const ft = Math.floor(eighths / 96), inch = (eighths - ft * 96) / 8;
  const whole = Math.floor(inch), frac = inch - whole;
  const fr = frac ? ' ' + { 0.125: '1/8', 0.25: '1/4', 0.375: '3/8', 0.5: '1/2', 0.625: '5/8', 0.75: '3/4', 0.875: '7/8' }[frac] : '';
  return ft ? `${ft} ft ${whole}${fr} in.` : `${whole}${fr} in.`;
}
const inch = (mm) => ftIn(mm);
const sqft = (mm2) => (Math.round(mm2 / SQFT * 10) / 10) + ' sq ft';

const label = (e) => [e.longname, e.name].filter(Boolean).join(' · ') || e.cls?.replace(/^Ifc/, '') + ' #' + e.id;
const firstLen = (e, ...fields) => { for (const f of fields) { const v = f.startsWith('@') ? e.attr(f.slice(1)) : e.v(f); const mm = e.L(v); if (mm) return mm; } return null; };
const firstNum = (e, ...fields) => { for (const f of fields) { const v = num(f.startsWith('@') ? e.attr(f.slice(1)) : e.v(f)); if (v !== null) return v; } return null; };

// ---- the tests, one per rule topic ----
const isStair = (e) => e.cls === 'IfcStair' || e.cls === 'IfcStairFlight';
const isSpiral = (e, d) => /SPIRAL/.test(e.predefined) || (d.parent.has(e.id) && /SPIRAL/.test(d.byId.get(d.parent.get(e.id))?.predefined || ''));

function stairValues(e) {
  return {
    riser: firstLen(e, 'p:Pset_StairCommon.RiserHeight', 'p:Pset_StairFlightCommon.RiserHeight', '@RiserHeight', 'p:CadCraft_Stair.RiserUsed'),
    tread: firstLen(e, 'p:Pset_StairCommon.TreadLength', 'p:Pset_StairFlightCommon.TreadLength', '@TreadLength', 'p:CadCraft_Stair.Tread'),
    risers: firstNum(e, 'p:Pset_StairCommon.NumberOfRiser', 'p:Pset_StairFlightCommon.NumberOfRiser', '@NumberOfRisers', 'p:CadCraft_Stair.Risers'),
    width: firstLen(e, 'p:CadCraft_Stair.Width', 'p:Pset_StairCommon.Width', 'p:Pset_StairFlightCommon.Width'),
  };
}

/** The stairs to judge: a flight whose stair already holds the values is the same stair (Bildra writes both). */
function stairsOf(d) {
  const withValues = new Set(d.elements.filter((e) => e.cls === 'IfcStair' && stairValues(e).riser).map((e) => e.id));
  return d.elements.filter((e) => isStair(e) && !(e.cls === 'IfcStairFlight' && withValues.has(d.parent.get(e.id))));
}
const railings = (d) => d.elements.filter((e) => e.cls === 'IfcRailing');
const nearStair = (r, d) => d.parent.has(r.id) && isStair(d.byId.get(d.parent.get(r.id)) || {}) || (r.box && d.elements.some((s) => isStair(s) && s.box && overlaps(r.box, s.box, 150)));

const TESTS = {
  stair(rule, d) {
    const out = [];
    for (const e of stairsOf(d)) {
      if (isSpiral(e, d)) continue;   // the spiral rule judges those
      const s = stairValues(e), lim = rule.limits;
      const row = (status, measured, why) => out.push({ key: e.key, label: label(e), status, measured, why });
      if (rule.id === 'stair-riser') {
        if (!s.riser) row('check', null, 'No riser height in the model.');
        else row(s.riser <= lim.riserMax * IN + 0.5 ? 'pass' : 'fail', inch(s.riser));
      } else if (rule.id === 'stair-tread') {
        if (!s.tread) row('check', null, 'No tread depth in the model.');
        else row(s.tread >= lim.treadMin * IN - 0.5 ? 'pass' : 'fail', inch(s.tread));
      } else if (rule.id === 'stair-width') {
        let w = s.width, how = '';
        if (!w && e.cls === 'IfcStairFlight' && e.box) { w = Math.min(...plan(e.box)); how = ' (from the flight\'s outline)'; }
        if (!w) row('check', null, 'No stair width in the model.');
        else row(w >= lim.widthMin * IN - 0.5 ? 'pass' : 'fail', inch(w) + how);
      } else if (rule.id === 'stair-rise') {
        const straight = e.cls === 'IfcStairFlight' || /STRAIGHT/.test(e.predefined);
        const rise = s.riser && s.risers ? s.riser * s.risers : null;
        if (!rise) row('check', null, 'No riser count or height in the model.');
        else if (!straight && rise > lim.riseMax * IN) row('check', inch(rise) + ' (whole stair)', 'Over 151 in. in all: check that a landing splits it.');
        else row(rise <= lim.riseMax * IN + 0.5 ? 'pass' : 'fail', inch(rise));
      } else if (rule.id === 'stair-handrail') {
        if (!s.risers) { row('check', null, 'No riser count in the model.'); continue; }
        if (s.risers < lim.risersForRail) { row('pass', s.risers + ' risers', 'Fewer than 4 risers: no handrail needed.'); continue; }
        const has = railings(d).some((r) => d.parent.get(r.id) === e.id || (r.box && e.box && overlaps(r.box, e.box, 150)));
        row(has ? 'pass' : 'fail', s.risers + ' risers', has ? null : 'No railing found along this stair.');
      }
    }
    return out;
  },
  spiral(rule, d) {
    const out = [], lim = rule.limits;
    for (const e of stairsOf(d).filter((x) => isSpiral(x, d))) {
      const s = stairValues(e), bad = [], miss = [];
      if (s.riser) { if (s.riser > lim.riserMax * IN + 0.5) bad.push('riser ' + inch(s.riser)); } else miss.push('riser height');
      if (s.tread) { if (s.tread < lim.treadMin * IN - 0.5) bad.push('tread ' + inch(s.tread)); } else miss.push('tread depth');
      if (s.width) { if (s.width < lim.widthMin * IN - 0.5) bad.push('width ' + inch(s.width)); } else miss.push('width');
      out.push({ key: e.key, label: label(e), status: bad.length ? 'fail' : miss.length ? 'check' : 'pass',
        measured: [s.riser && 'riser ' + inch(s.riser), s.tread && 'tread ' + inch(s.tread), s.width && 'width ' + inch(s.width)].filter(Boolean).join(', '),
        why: bad.length ? 'Outside the limits: ' + bad.join(', ').replace(/\.$/, '') + '.' : miss.length ? 'Not in the model: ' + miss.join(', ') + '.' : null });
    }
    return out;
  },
  handrail(rule, d) {
    const out = [], lim = rule.limits;
    for (const r of railings(d).filter((x) => /HANDRAIL/.test(x.predefined) || (!/GUARD/.test(x.predefined) && nearStair(x, d)))) {
      const stair = d.byId.get(d.parent.get(r.id));
      const ht = firstLen(r, 'p:Pset_RailingCommon.Height', 'p:CadCraft_Railing.Height') || (stair && firstLen(stair, 'p:CadCraft_Stair.RailHeight'));
      if (!ht) { out.push({ key: r.key, label: label(r), status: 'check', measured: null, why: 'No handrail height in the model.' }); continue; }
      out.push({ key: r.key, label: label(r), status: ht >= lim.railMin * IN - 0.5 && ht <= lim.railMax * IN + 0.5 ? 'pass' : 'fail', measured: inch(ht) });
    }
    return out;
  },
  guard(rule, d) {
    const out = [], lim = rule.limits;
    for (const r of railings(d).filter((x) => !/HANDRAIL/.test(x.predefined))) {
      const onStair = nearStair(r, d);
      if (onStair && !/GUARD/.test(r.predefined)) continue;   // a stair's railing is its handrail (the handrail rule)
      const prop = firstLen(r, 'p:Pset_RailingCommon.Height', 'p:CadCraft_Railing.Height');
      const min = (onStair ? lim.stairGuardMin : lim.guardMin) * IN;
      if (prop) { out.push({ key: r.key, label: label(r), status: prop >= min - 0.5 ? 'pass' : 'fail', measured: inch(prop) + (onStair ? ' (stair side: 34 in.)' : '') }); continue; }
      if (onStair || !r.box) { out.push({ key: r.key, label: label(r), status: 'check', measured: null, why: 'No guard height in the model.' }); continue; }
      const ht = h(r.box);   // a level guard: its outline's height
      out.push({ key: r.key, label: label(r), status: ht >= min - 0.5 ? 'pass' : 'fail', measured: inch(ht) + ' (from its outline)' });
    }
    return out;
  },
  egressDoor(rule, d) {
    const lim = rule.limits;
    const doors = d.elements.filter((e) => e.cls === 'IfcDoor');
    if (!doors.length) return [{ key: null, label: 'Whole model', status: 'check', measured: null, why: 'No doors in the model.' }];
    const marked = doors.filter((e) => e.v('p:Pset_DoorCommon.IsExternal') !== undefined);
    // side-hinged: a swinging leaf (IfcDoor.OperationType *SWING*); rolling, sliding, folding and revolving doors are not
    const op = (e) => String(e.attr('OperationType') ?? '');
    const hinged = (e) => /SWING/.test(op(e)) || ((!op(e) || /NOTDEFINED|USERDEFINED/.test(op(e))) && !/garage|overhead|roll|slid|fold|revolv/i.test(e.name + ' ' + e.objtype));
    const ext = (marked.length ? doors.filter((e) => yes(e.v('p:Pset_DoorCommon.IsExternal'))) : doors).filter(hinged);
    const size = (e) => ({
      w: firstLen(e, '@OverallWidth', 'p:Qto_DoorBaseQuantities.Width') ?? (e.box ? Math.max(...plan(e.box)) : null),
      h: firstLen(e, '@OverallHeight', 'p:Qto_DoorBaseQuantities.Height') ?? (e.box ? h(e.box) : null),
    });
    const sized = ext.map((e) => ({ e, ...size(e) })).filter((x) => x.w && x.h);
    const big = sized.filter((x) => x.w >= lim.clearWidthMin * IN - 0.5 && x.h >= lim.clearHeightMin * IN - 0.5).sort((a, b) => b.w - a.w);
    const where = marked.length ? 'exterior doors' : 'doors (none is marked exterior in the model)';
    if (!big.length) return [{ key: null, label: 'Whole model', status: 'fail', measured: sized.length ? 'largest ' + inch(Math.max(...sized.map((x) => x.w))) + ' wide' : null,
      why: `No side-hinged ${where} is 32 in. wide and 78 in. high, even before the frame and stop.` }];
    const best = big[0];
    return [{ key: best.e.key, label: label(best.e), status: 'check', measured: inch(best.w) + ' × ' + inch(best.h) + ' (door size)',
      why: 'Confirm the clear width with the door open: from the face of the door to the stop, at least 32 in.' }];
  },
  hallway(rule, d) {
    return d.spaces.filter((s) => roomKind(s.longname, s.name) === 'hallway' && s.box).map((s) => {
      const w = Math.min(...plan(s.box)), min = rule.limits.widthMin * IN;
      if (w < min - 0.5) return { key: s.key, label: label(s), status: 'fail', measured: inch(w) };
      return rectangular(s) ? { key: s.key, label: label(s), status: 'pass', measured: inch(w) }
        : { key: s.key, label: label(s), status: 'check', measured: inch(w) + ' (outline)', why: 'Not a rectangle: check its narrowest part.' };
    });
  },
  roomArea(rule, d) {
    return d.spaces.filter((s) => ['sleeping', 'habitable'].includes(roomKind(s.longname, s.name))).map((s) => {
      if (s.area === null) return { key: s.key, label: label(s), status: 'check', measured: null, why: 'The room has no floor shape in the model.' };
      const a = s.area * 1e6;
      return { key: s.key, label: label(s), status: a >= rule.limits.areaMin * SQFT * 0.995 ? 'pass' : 'fail', measured: sqft(a) };
    });
  },
  roomDim(rule, d) {
    return d.spaces.filter((s) => ['sleeping', 'habitable'].includes(roomKind(s.longname, s.name)) && s.box).map((s) => {
      const w = Math.min(...plan(s.box)), min = rule.limits.dimMin * IN;
      if (w < min - 0.5) return { key: s.key, label: label(s), status: 'fail', measured: inch(w) };
      return rectangular(s) ? { key: s.key, label: label(s), status: 'pass', measured: inch(w) }
        : { key: s.key, label: label(s), status: 'check', measured: inch(w) + ' (outline)', why: 'Not a rectangle: check its narrowest part.' };
    });
  },
  ceiling(rule, d) {
    const out = [];
    for (const s of d.spaces) {
      const kind = roomKind(s.longname, s.name);
      if (!kind) continue;
      const min = (kind === 'wet' ? rule.limits.wetMin : rule.limits.habitableMin) * IN;
      const ht = firstLen(s, 'p:Qto_SpaceBaseQuantities.FinishCeilingHeight', 'p:Qto_SpaceBaseQuantities.Height', 'p:Pset_SpaceCommon.FinishCeilingHeight') ?? (s.box ? h(s.box) : null);
      if (!ht) { out.push({ key: s.key, label: label(s), status: 'check', measured: null, why: 'No ceiling height in the model.' }); continue; }
      out.push({ key: s.key, label: label(s), status: ht >= min - 0.5 ? 'pass' : 'fail', measured: inch(ht) + (kind === 'wet' ? ' (bath, toilet or laundry: 6 ft 8 in.)' : '') });
    }
    return out;
  },
  escape(rule, d) {
    const lim = rule.limits, out = [];
    // operable windows first, then exterior side-hinged doors; a fixed window ("picture", FIXEDCASEMENT) is no escape
    const fixed = (e) => /picture|fixed/i.test(e.name + ' ' + e.objtype) || /FIXED/.test(String(e.attr('PartitioningType') ?? ''));
    const extDoor = (e) => yes(e.v('p:Pset_DoorCommon.IsExternal')) && /SWING/.test(String(e.attr('OperationType') ?? ''));
    const openings = [...d.elements.filter((e) => e.cls === 'IfcWindow' && e.box && !fixed(e)), ...d.elements.filter((e) => e.cls === 'IfcDoor' && e.box && extDoor(e))];
    const lowest = Math.min(...d.storeys.map((s) => s.elevation ?? 0));
    for (const s of d.spaces.filter((x) => roomKind(x.longname, x.name) === 'sleeping' && x.box)) {
      const near = openings.filter((o) => overlaps(o.box, s.box, 400) && o.box[1] < s.box[4] && o.box[4] > s.box[1]);
      if (!near.length) { out.push({ key: s.key, label: label(s), status: 'fail', measured: null, why: 'No window that opens (or exterior door) found in this room\'s walls.' }); continue; }
      const grade = d.storeys.find((st) => st.id === s.storey)?.elevation === lowest;
      const area = (grade ? lim.areaGradeMin : lim.areaMin) * SQFT;
      const judged = near.map((o) => {
        const w = firstLen(o, '@OverallWidth', 'p:Qto_WindowBaseQuantities.Width', 'p:Qto_DoorBaseQuantities.Width') ?? Math.max(...plan(o.box));
        const ht = firstLen(o, '@OverallHeight', 'p:Qto_WindowBaseQuantities.Height', 'p:Qto_DoorBaseQuantities.Height') ?? h(o.box);
        const sill = o.box[1] - s.box[1];
        const small = w < lim.widthMin * IN - 0.5 || ht < lim.heightMin * IN - 0.5 || w * ht < area * 0.995;
        return { o, w, ht, sill, ok: !small && sill <= lim.sillMax * IN + 0.5 };
      });
      const best = judged.find((j) => j.ok) || [...judged].sort((a, b) => b.w * b.ht - a.w * a.ht)[0];
      const measured = `${inch(best.w)} × ${inch(best.ht)} (${sqft(best.w * best.ht)} overall), sill ${inch(best.sill)}`;
      out.push(best.ok
        ? { key: s.key, label: label(s), status: 'check', measured, why: `${best.o.name || 'This opening'} is large enough overall; confirm it opens and its net clear opening is at least ${grade ? 5 : 5.7} sq ft, 24 in. high and 20 in. wide.` }
        : { key: s.key, label: label(s), status: 'fail', measured, why: best.sill > lim.sillMax * IN + 0.5 ? 'Sill higher than 44 in. above the floor.' : 'Too small even at its overall size.' });
    }
    return out;
  },
  smoke(rule, d) {
    const alarms = d.elements.filter((e) => /smoke/i.test([e.name, e.objtype, e.predefined, e.longname].join(' ')) || /SMOKE/.test(e.predefined));
    const sleeping = d.spaces.filter((x) => roomKind(x.longname, x.name) === 'sleeping' && x.box);
    if (!alarms.length) {
      return sleeping.length ? [{ key: null, label: 'Whole model', status: 'check', measured: '0 smoke alarms', why: 'The model shows no smoke alarms: show them on the plans (each sleeping room, outside each sleeping area, each story).' }] : [];
    }
    const out = sleeping.map((s) => {
      const has = alarms.some((a) => a.box && inside(centre(a.box), s.box));
      return { key: s.key, label: label(s), status: has ? 'pass' : 'fail', measured: null, why: has ? null : 'No smoke alarm in this sleeping room.' };
    });
    const storeysWithRooms = new Set(d.spaces.filter((s) => roomKind(s.longname, s.name)).map((s) => s.storey));
    for (const st of d.storeys.filter((x) => storeysWithRooms.has(x.id))) {
      if (!alarms.some((a) => a.storey === st.id)) out.push({ key: null, label: st.name, status: 'fail', measured: null, why: 'No smoke alarm on this story.' });
    }
    return out;
  },
};

export function runCodeCheck(d, { rules = RULES } = {}) {
  // what a result selects when clicked: the element, or for a whole with no shape (a stair) its parts
  const partsOf = new Map();
  for (const [p, w] of d.parent) { if (!partsOf.has(w)) partsOf.set(w, []); partsOf.get(w).push(p); }
  const keysOf = (key) => {
    if (key === null || key === undefined) return [];
    const e = d.elements.find((x) => x.key === key) || d.spaces.find((x) => x.key === key);
    if (!e || e.box) return [key];
    return (partsOf.get(e.id) || []).map((id) => d.byId.get(id)).filter((x) => x?.box).map((x) => x.key);
  };
  const out = rules.map((rule) => {
    const items = TESTS[rule.topic](rule, d).map((i) => ({ ...i, keys: keysOf(i.key) }));
    const counts = { pass: 0, fail: 0, check: 0 };
    for (const i of items) counts[i.status]++;
    return { rule, items, counts };
  });
  const kinds = d.spaces.map((s) => roomKind(s.longname, s.name));
  return { edition: EDITION, rules: out, notChecked: NOT_CHECKED, rooms: { judged: kinds.filter(Boolean).length, unknown: kinds.filter((k) => !k).length } };
}

/** The wholes in `aggregates` (a stair, a ramp) with their class, name, type and properties, read from the IFC: they
 *  carry the settings (CadCraft_Stair.Width, RailHeight) but no shape, so the property index does not hold them. */
export function wholesOf(api, mid, aggregates) {
  const want = new Set(aggregates.map(([w]) => w));
  const out = new Map();
  const v = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);
  for (const id of want) {
    let l = null; try { l = api.GetLine(mid, id, false); } catch (e) { l = null; }
    const cls = l && api.GetNameFromTypeCode ? api.GetNameFromTypeCode(l.type) : null;
    if (!l || !/^IFCSTAIR$|^IFCRAMP$/i.test(cls || '')) continue;
    out.set(id, { cls: cls.toUpperCase() === 'IFCSTAIR' ? 'IfcStair' : 'IfcRamp', name: v(l.Name) || '', predefined: String(v(l.PredefinedType) || ''), props: {} });
  }
  if (!out.size) return out;
  const rels = api.GetLineIDsWithType(mid, api.GetTypeCodeFromName('IFCRELDEFINESBYPROPERTIES'), true);
  for (let i = 0; i < rels.size(); i++) {
    const r = api.GetLine(mid, rels.get(i), false);
    const hits = (r.RelatedObjects || []).map(v).filter((id) => out.has(id));
    if (!hits.length) continue;
    const ps = api.GetLine(mid, v(r.RelatingPropertyDefinition), false);
    for (const h of ps?.HasProperties || ps?.Quantities || []) {
      const p = api.GetLine(mid, v(h), false);
      const val = v(p?.NominalValue ?? p?.LengthValue ?? p?.CountValue);
      if (p?.Name && val !== undefined && val !== null) for (const id of hits) out.get(id).props['p:' + v(ps.Name) + '.' + v(p.Name)] = typeof val === 'string' && val !== '' && !isNaN(Number(val)) ? Number(val) : val;
    }
  }
  return out;
}

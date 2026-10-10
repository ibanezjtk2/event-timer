// Runs tests/scenarios.json against the JS engine:  node tools/test-engine.js
'use strict';
const path = require('path');
const fs = require('fs');
const E = require(path.join(__dirname, '..', 'web', 'js', 'engine.js'));

const scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'scenarios.json'), 'utf8'));

function resolve(state, p, now) {
  const parts = p.split('.');
  if (parts[0] === 'view') {
    const t = state.timers.find(x => x.id === parts[1]);
    if (!t) return undefined;
    return E.timerView(t, now)[parts[2]];
  }
  if (parts[0] === 'agendaView') return E.agendaView(state, now)[parts[1]];
  return parts.reduce((v, k) => (v == null ? undefined : v[k]), state);
}

let failed = 0, passed = 0;
for (const sc of scenarios) {
  const s = E.defaultState();
  sc.steps.forEach((step, i) => {
    if (step.do) {
      const changed = E.apply(s, step.do, step.at);
      const want = step.changed === undefined ? true : step.changed;
      if (changed !== want) { failed++; console.log(`✗ ${sc.name} #${i} ${step.do.type}: changed=${changed}, expected ${want}`); }
      else passed++;
    }
    for (const [p, want] of Object.entries(step.expect || {})) {
      const got = resolve(s, p, step.at);
      if (JSON.stringify(got) !== JSON.stringify(want)) { failed++; console.log(`✗ ${sc.name} #${i} ${p}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); }
      else passed++;
    }
  });
}
// formatting / parsing
const fmt = [[0, '00:00'], [59001, '01:00'], [3600000, '1:00:00'], [-61000, '+01:01'], [599999, '10:00']];
for (const [ms, want] of fmt) { const got = E.formatMs(ms); if (got !== want) { failed++; console.log(`✗ formatMs(${ms}) = ${got}, expected ${want}`); } else passed++; }
const parse = [['10', 600000], ['1:30', 90000], ['1:00:00', 3600000], ['90s', 90000], ['1h 5m', 3900000], ['2,5', 150000], ['x', null]];
for (const [inp, want] of parse) { const got = E.parseDuration(inp); if (got !== want) { failed++; console.log(`✗ parseDuration(${inp}) = ${got}, expected ${want}`); } else passed++; }

// clock-driven schedule (local time zone dependent → pin it)
process.env.TZ = 'Europe/Berlin';
{
  const s = E.defaultState();
  E.apply(s, { type: 'agenda.replace', items: [
    { title: 'A', start: '13:00', end: '15:00' },
    { title: 'B', durationMs: 30 * 60000 },
    { title: 'C', start: '16:00', durationMs: 60 * 60000 },
  ] }, 0);
  const at = (h, m) => new Date(2026, 9, 10, h, m).getTime();
  const check = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { failed++; console.log(`✗ schedule ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); } else passed++; };
  let v = E.scheduleView(s, at(14, 0));
  check('current', v.current && v.current.item.title, 'A');
  check('remaining', v.remainingMs, 3600000);
  check('progress', v.progress, 0.5);
  check('next', v.next && v.next.item.title, 'B');
  check('B start', E.toHHMM(v.rows[1].start), '15:00');
  check('B end', E.toHHMM(v.rows[1].end), '15:30');
  v = E.scheduleView(s, at(15, 40));
  check('gap current', v.current, null);
  check('gap ms', v.gapMs, 20 * 60000);
  check('gap next', v.next && v.next.item.title, 'C');
  check('statuses', v.rows.map(r => r.status), ['done', 'done', 'todo']);
  v = E.scheduleView(s, at(17, 30));
  check('finished', v.finished, true);
  check('endAt', E.toHHMM(v.endAt), '17:00');
  v = E.scheduleView(s, at(12, 0));
  check('before', [v.current, v.next && v.next.item.title, v.gapMs], [null, 'A', 3600000]);
  const s2 = E.defaultState();
  E.apply(s2, { type: 'agenda.replace', items: [{ title: 'X', durationMs: 600000 }] }, 0);
  check('no times', E.scheduleView(s2, at(12, 0)).ready, false);
  E.apply(s2, { type: 'agenda.settings', plannedStart: '11:55' }, 0);
  v = E.scheduleView(s2, at(12, 0));
  check('planned start', [v.current && v.current.item.title, v.remainingMs], ['X', 300000]);
  // past midnight
  const s3 = E.defaultState();
  E.apply(s3, { type: 'agenda.replace', items: [{ title: 'Late', start: '23:30', end: '00:30' }, { title: 'Later', durationMs: 600000 }] }, 0);
  v = E.scheduleView(s3, at(23, 45));
  check('midnight', [v.current.item.title, v.remainingMs, E.toHHMM(v.rows[1].end)], ['Late', 45 * 60000, '00:40']);

  // live corrections: A 13–15, B follows (30 min), C fixed at 16:00
  const s4 = E.defaultState();
  E.apply(s4, { type: 'agenda.replace', items: [
    { title: 'A', start: '13:00', end: '15:00' }, { title: 'B', durationMs: 30 * 60000 }, { title: 'C', start: '16:00', durationMs: 3600000 },
  ] }, 0);
  E.apply(s4, { type: 'agenda.adjust', itemId: 's1', ms: 10 * 60000, ripple: true }, 0);
  v = E.scheduleView(s4, at(14, 0));
  check('extend ripple', [E.toHHMM(v.rows[0].end), E.toHHMM(v.rows[1].start), E.toHHMM(v.rows[2].start)], ['15:10', '15:10', '16:10']);
  check('extend remaining', v.remainingMs, 70 * 60000);
  E.apply(s4, { type: 'agenda.adjust', itemId: 's2', ms: 40 * 60000 }, 0);
  v = E.scheduleView(s4, at(14, 0));
  check('no overlap', [E.toHHMM(v.rows[1].end), E.toHHMM(v.rows[2].start)], ['16:20', '16:20']);
  E.apply(s4, { type: 'agenda.clearAdjust' }, 0);
  E.apply(s4, { type: 'agenda.hold' }, at(14, 0));
  v = E.scheduleView(s4, at(14, 30));
  check('held', [v.held, v.remainingMs, v.heldMs], [true, 3600000, 30 * 60000]);
  E.apply(s4, { type: 'agenda.resume', itemId: 's1' }, at(14, 30));
  v = E.scheduleView(s4, at(14, 30));
  check('resumed', [v.held, v.remainingMs, E.toHHMM(v.rows[2].start)], [false, 3600000, '16:30']);
  E.apply(s4, { type: 'agenda.clearAdjust' }, 0);
  E.apply(s4, { type: 'agenda.shift', ms: -15 * 60000 }, 0);
  v = E.scheduleView(s4, at(14, 0));
  // cues: clock mode (A 13–15, B 15–15:30, C 16–17)
  const s5 = E.defaultState();
  E.apply(s5, { type: 'agenda.replace', items: [
    { title: 'A', start: '13:00', end: '15:00' }, { title: 'B', durationMs: 30 * 60000 }, { title: 'C', start: '16:00', durationMs: 3600000 },
  ] }, 0);
  E.apply(s5, { type: 'agenda.settings', mode: 'clock' }, 0);
  E.apply(s5, { type: 'cue.add', itemId: 's1', text: 'Abmod', ref: 'end', offsetMs: -2 * 60000 }, 0);
  E.apply(s5, { type: 'cue.add', itemId: 's2', text: 'Kaffee-Musik', ref: 'start', offsetMs: 0 }, 0);
  E.apply(s5, { type: 'cue.add', itemId: 's3', text: 'Panel-Mikros', ref: 'start', offsetMs: -5 * 60000 }, 0);
  let cv = E.cueView(s5, at(14, 57) + 30000);
  check('cue standby', cv.map(c => c.cue.text + ':' + c.status), ['Abmod:standby', 'Kaffee-Musik:later', 'Panel-Mikros:later']);
  cv = E.cueView(s5, at(14, 58));
  check('cue go', [cv[0].cue.text, cv[0].status, cv[0].inMs], ['Abmod', 'go', 0]);
  E.apply(s5, { type: 'cue.done', itemId: 's1', cueId: cv[0].cue.id }, 0);
  cv = E.cueView(s5, at(15, 54) + 30000);
  check('cue later + missed', cv.map(c => c.cue.text + ':' + c.status), ['Panel-Mikros:standby', 'Kaffee-Musik:missed', 'Abmod:done']);
  // manual mode: untimed until the slot starts
  E.apply(s5, { type: 'agenda.settings', mode: 'manual' }, 0);
  cv = E.cueView(s5, at(12, 0));
  check('manual untimed', cv.filter(c => c.cue.text === 'Kaffee-Musik').map(c => c.status), ['later']);
  E.apply(s5, { type: 'agenda.go', index: 1 }, at(12, 0));
  cv = E.cueView(s5, at(12, 0) + 1000);
  check('manual go on start', cv.filter(c => c.cue.text === 'Kaffee-Musik').map(c => c.status), ['go']);
  check('manual next ready', cv.filter(c => c.cue.text === 'Panel-Mikros').map(c => c.status), ['ready']);

  check('shift all', [E.toHHMM(v.rows[0].start), E.toHHMM(v.rows[2].start), v.remainingMs], ['12:45', '15:45', 45 * 60000]);
}

console.log(`JS engine: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
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

// planned times + running run of show (local time zone dependent → pin it)
process.env.TZ = 'Europe/Berlin';
{
  const at = (h, m) => new Date(2026, 9, 10, h, m).getTime();
  const check = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { failed++; console.log(`✗ plan ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); } else passed++; };
  const s = E.defaultState();
  E.apply(s, { type: 'agenda.replace', items: [
    { title: 'A', start: '13:00', end: '15:00' },
    { title: 'B', durationMs: 30 * 60000 },
    { title: 'C', start: '16:00', durationMs: 60 * 60000 },
  ] }, 0);
  let p = E.planView(s, at(14, 0));
  check('A', [E.toHHMM(p.rows[0].start), E.toHHMM(p.rows[0].end)], ['13:00', '15:00']);
  check('B follows', [E.toHHMM(p.rows[1].start), E.toHHMM(p.rows[1].end)], ['15:00', '15:30']);
  check('C fixed', E.toHHMM(p.rows[2].start), '16:00');
  check('endAt', E.toHHMM(p.endAt), '17:00');
  const s2 = E.defaultState();
  E.apply(s2, { type: 'agenda.replace', items: [{ title: 'X', durationMs: 600000 }] }, 0);
  check('no times', E.planView(s2, at(12, 0)).rows[0].start, null);
  E.apply(s2, { type: 'agenda.settings', plannedStart: '11:55' }, 0);
  check('planned start', E.toHHMM(E.planView(s2, at(12, 0)).rows[0].end), '12:05');
  const s3 = E.defaultState();
  E.apply(s3, { type: 'agenda.replace', items: [{ title: 'Late', start: '23:30', end: '00:30' }, { title: 'Later', durationMs: 600000 }] }, 0);
  check('midnight', E.toHHMM(E.planView(s3, at(23, 45)).rows[1].end), '00:40');

  // runView: GO by GO, remaining time follows the linked timer
  let v = E.runView(s, at(12, 0));
  check('before start', [v.started, v.current, v.next.item.title, v.rows.map(r => r.status)], [false, null, 'A', ['next', 'todo', 'todo']]);
  E.apply(s, { type: 'agenda.next' }, at(13, 0));
  v = E.runView(s, at(14, 0));
  check('live A', [v.current.item.title, v.remainingMs, v.progress, v.running, v.next.item.title], ['A', 3600000, 0.5, true, 'B']);
  check('statuses', v.rows.map(r => r.status), ['live', 'next', 'todo']);
  E.apply(s, { type: 'timer.adjust', id: 't1', ms: 5 * 60000 }, at(14, 0));
  E.apply(s, { type: 'timer.pause', id: 't1' }, at(14, 0));
  v = E.runView(s, at(14, 30));
  check('follows timer', [v.remainingMs, v.running], [65 * 60000, false]);
  E.apply(s, { type: 'agenda.next' }, at(15, 0));
  E.apply(s, { type: 'agenda.next' }, at(15, 30));
  E.apply(s, { type: 'agenda.next' }, at(16, 30));
  v = E.runView(s, at(16, 31));
  check('finished', [v.finished, v.current], [true, null]);

  // cues: untimed until the slot starts, then counted from the real start
  const s5 = E.defaultState();
  E.apply(s5, { type: 'agenda.replace', items: [
    { title: 'A', durationMs: 10 * 60000 }, { title: 'B', durationMs: 30 * 60000 }, { title: 'C', durationMs: 3600000 },
  ] }, 0);
  E.apply(s5, { type: 'cue.add', itemId: 's1', text: 'Abmod', ref: 'end', offsetMs: -2 * 60000 }, 0);
  E.apply(s5, { type: 'cue.add', itemId: 's2', text: 'Kaffee-Musik', ref: 'start', offsetMs: 0 }, 0);
  E.apply(s5, { type: 'cue.add', itemId: 's3', text: 'Panel-Mikros', ref: 'start', offsetMs: -5 * 60000 }, 0);
  let cv = E.cueView(s5, at(12, 0));
  check('cue untimed', cv.map(c => c.cue.text + ':' + c.status), ['Abmod:ready', 'Kaffee-Musik:later', 'Panel-Mikros:later']);
  E.apply(s5, { type: 'agenda.next' }, at(12, 0));
  cv = E.cueView(s5, at(12, 7) + 30000);
  check('cue standby', [cv[0].cue.text, cv[0].status], ['Abmod', 'standby']);
  cv = E.cueView(s5, at(12, 8));
  check('cue go', [cv[0].cue.text, cv[0].status, cv[0].inMs], ['Abmod', 'go', 0]);
  E.apply(s5, { type: 'agenda.go', index: 1 }, at(12, 9));
  cv = E.cueView(s5, at(12, 9) + 1000);
  check('go on start', cv.filter(c => c.cue.text === 'Kaffee-Musik').map(c => c.status), ['go']);
  check('next ready', cv.filter(c => c.cue.text === 'Panel-Mikros').map(c => c.status), ['ready']);
  check('missed', cv.filter(c => c.cue.text === 'Abmod').map(c => c.status), ['missed']);

  // migration from 1.5.2
  const old = E.defaultState();
  Object.assign(old.agenda, { mode: 'clock', shiftMs: 5, holdAt: 1 });
  old.talkQuick = ['Noch 5 Minuten', 'Bitte zum Ende kommen', 'Letzte Frage', 'Mikrofon ist aus', 'Fragen aus dem Saal nehmen', 'Pause wird verlängert'];
  E.normalize(old);
  check('migrated', ['mode' in old.agenda, 'holdAt' in old.agenda, old.talkQuick.length, old.talkQuick[1]], [false, false, 8, 'Noch 1 Minute']);
  const own = E.defaultState(); own.talkQuick = ['Eigene']; E.normalize(own);
  check('own list kept', own.talkQuick, ['Eigene']);
}

console.log(`JS engine: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

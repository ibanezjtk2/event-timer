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

console.log(`JS engine: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

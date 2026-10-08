import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const window = {};
vm.runInNewContext(readFileSync(new URL('../public/assets/calendar.js', import.meta.url), 'utf8'), {
  window,
});
const { matches, entries, dayCounts } = window.EventCalendar;
const event = {
  id: 'synthetic',
  name: 'Example workshop',
  city: 'sf',
  date: '2026-10-05',
  time: '10:00',
  endDate: '2026-10-07',
  formats: ['Workshop'],
  purposes: [],
  status: 'open',
  brief: 'Demo only',
  hosts: ['Example'],
  place: 'Demo',
  themes: ['AI'],
};
const state = { city: 'all', date: '', format: '', purpose: '', status: '', q: '', address: false };
test('address filter composes with city, search and inclusive multi-day dates', () => {
  const filter = { ...state, address: true, date: '2026-10-06', q: 'workshop', city: 'sf' };
  assert.equal(matches(event, filter, { synthetic: 1 }), true);
  assert.equal(matches(event, filter, {}), false);
  assert.equal(matches(event, filter, null), false);
  assert.equal(matches(event, { ...filter, city: 'la' }, { synthetic: 1 }), false);
  assert.equal(matches(event, { ...filter, date: '2026-10-08' }, { synthetic: 1 }), false);
  assert.equal(matches(event, { ...filter, date: '2026-10-08' }, { synthetic: 1 }, true), true);
});
test('calendar expands dates inclusively and sorts ongoing events before timed starts', () => {
  const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  const short = {
    ...event,
    id: 'short',
    name: 'Earlier appointment',
    date: '2026-10-06',
    endDate: '2026-10-06',
    time: '08:00',
  };
  const result = entries([short, event], dates);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.map((row) => [row.date, row.event.id, row.continuing]))),
    [
      ['2026-10-05', 'synthetic', false],
      ['2026-10-06', 'synthetic', true],
      ['2026-10-06', 'short', false],
      ['2026-10-07', 'synthetic', true],
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(dayCounts([short, event], dates))), {
    '2026-10-05': 1,
    '2026-10-06': 2,
    '2026-10-07': 1,
    '2026-10-08': 0,
  });
});

test('official featured filter intersects address, date and city filters and calendar counts', () => {
  const featured = { ...event, featured: true };
  const filter = { ...state, featured: true, address: true, city: 'sf', date: '2026-10-06' };
  assert.equal(matches(featured, filter, { synthetic: 1 }), true);
  assert.equal(matches({ ...featured, featured: false }, filter, { synthetic: 1 }), false);
  assert.equal(matches(event, filter, { synthetic: 1 }), false);
  assert.equal(matches(featured, filter, {}), false);
  assert.equal(matches(featured, { ...filter, city: 'la' }, { synthetic: 1 }), false);
  const candidates = [featured, { ...event, id: 'ordinary' }].filter((row) =>
    matches(row, { ...state, featured: true }, null, true),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(dayCounts(candidates, ['2026-10-06']))), {
    '2026-10-06': 1,
  });
});

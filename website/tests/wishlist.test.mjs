import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
import { EVENT_IDS } from '../backend/event-ids.mjs';
import { database } from './d1-local.mjs';
const site = 'https://tech-week-2026-guide.aaron-he-zhu.workers.dev';
const db = database(),
  env = { DB: db, SITE_URL: site },
  ctx = { waitUntil: (p) => p.catch(() => {}) };
const id = EVENT_IDS[0];
const snapshot = {
  name: '测试活动',
  city: 'sf',
  date: '2026-10-05',
  time: '10:00',
  endDate: '2026-10-05',
  endTime: '11:00',
  url: 'https://www.tech-week.com/calendar/sf/events/test',
  place: 'San Francisco',
  status: 'open',
};
async function call(path, { method = 'GET', data, token, origin = site } = {}) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const r = await worker.fetch(
    new Request('https://api.example' + path, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    env,
    ctx,
  );
  return { status: r.status, headers: r.headers, data: r.status === 204 ? null : await r.json() };
}
let a, b, share;
test('anonymous identity, authentication and idempotent counts', async () => {
  a = (await call('/v1/session', { method: 'POST', data: {} })).data.token;
  b = (await call('/v1/session', { method: 'POST', data: {} })).data.token;
  assert.equal(a.length, 64);
  assert.notEqual(a, b);
  assert.equal((await call('/v1/me')).status, 401);
  assert.equal(
    (await call('/v1/wishes/' + id, { method: 'PUT', data: { snapshot }, token: a })).data.count,
    1,
  );
  assert.equal(
    (await call('/v1/wishes/' + id, { method: 'PUT', data: { snapshot }, token: a })).data.count,
    1,
  );
  assert.equal((await call('/v1/me', { token: b })).data.wishes.length, 0);
  assert.equal((await call('/v1/me', { token: a })).data.wishes.length, 1);
  assert.equal((await call('/v1/wishes/' + id, { method: 'DELETE', token: b })).data.count, 1);
  assert.equal(
    (await call('/v1/wishes/' + id, { method: 'PUT', data: { snapshot }, token: b })).data.count,
    2,
  );
});
test('nicknames are public, controls rejected, identities and secrets never public', async () => {
  assert.equal(
    (await call('/v1/me', { method: 'PATCH', data: { nickname: '小明' }, token: a })).status,
    200,
  );
  assert.equal(
    (await call('/v1/me', { method: 'PATCH', data: { nickname: '小\n明' }, token: a })).status,
    400,
  );
  const r = (await call('/v1/events/' + id + '/people')).data;
  assert.equal(r.count, 2);
  assert.deepEqual([...r.names].sort(), ['小明', '匿名访客'].sort());
  assert.ok(!JSON.stringify(r).includes(a));
  assert.ok(!JSON.stringify(r).includes('visitor_id'));
  const english = (await call('/v1/events/' + id + '/people?lang=en')).data;
  assert.deepEqual([...english.names].sort(), ['小明', 'Anonymous visitor'].sort());
  const englishSummary = (await call('/v1/summary?ids=' + id + '&lang=en')).data.events[id];
  assert.deepEqual([...englishSummary.names].sort(), ['小明', 'Anonymous visitor'].sort());
  const s = (await call('/v1/summary?ids=' + id)).data.events[id];
  assert.equal(s.count, 2);
  assert.equal(s.names.length, 2);
  assert.equal(
    (await call('/v1/me', { method: 'PATCH', data: { nickname: '新昵称' }, token: a })).status,
    200,
  );
  assert.ok((await call('/v1/events/' + id + '/people')).data.names.includes('新昵称'));
});
test('recovery uses original identity; read-only sharing cannot authorize writes and can be revoked', async () => {
  assert.equal((await call('/v1/me', { token: a })).data.nickname, '新昵称');
  share = (await call('/v1/share', { method: 'POST', data: { enabled: true }, token: a })).data
    .shareToken;
  assert.notEqual(share, a);
  assert.equal((await call('/v1/shared/' + share)).data.wishes.length, 1);
  assert.equal((await call('/v1/wishes/' + id, { method: 'DELETE', token: share })).status, 401);
  assert.equal((await call('/v1/me', { token: b })).data.wishes.length, 1);
  await call('/v1/share', { method: 'POST', data: { enabled: false }, token: a });
  assert.equal((await call('/v1/shared/' + share)).status, 404);
});
test('cancel adjusts people and counts; invalid events, payloads and foreign origins rejected', async () => {
  assert.equal((await call('/v1/wishes/' + id, { method: 'DELETE', token: a })).data.count, 1);
  assert.deepEqual((await call('/v1/events/' + id + '/people')).data.names, ['匿名访客']);
  assert.equal((await call('/v1/wishes/' + id, { method: 'DELETE', token: b })).data.count, 0);
  assert.equal(
    (
      await call('/v1/wishes/00000000-0000-0000-0000-000000000000', {
        method: 'PUT',
        data: { snapshot },
        token: a,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call('/v1/wishes/' + id, {
        method: 'PUT',
        data: { snapshot: { ...snapshot, url: 'javascript:alert(1)' } },
        token: a,
      })
    ).status,
    400,
  );
  assert.equal(
    (await call('/v1/me', { method: 'PATCH', data: { nickname: 'x'.repeat(9000) }, token: a }))
      .status,
    413,
  );
  assert.equal((await call('/v1/counts', { origin: 'https://evil.example' })).status, 403);
  const r = await call('/v1/counts');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), site);
});
test('session creation is rate limited', async () => {
  let r;
  for (let i = 0; i < 20; i++) r = await call('/v1/session', { method: 'POST', data: {} });
  assert.equal(r.status, 429);
});

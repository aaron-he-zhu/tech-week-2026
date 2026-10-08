import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
import { EVENT_STARTS } from '../backend/event-ids.mjs';
import { database } from './d1-local.mjs';

const starts = Object.entries(EVENT_STARTS).sort((a, b) => a[1] - b[1]);
const [id, started] = starts[0],
  [future, futureStart] = starts.at(-1);
function fixture() {
  const DB = database();
  async function call(path, { method = 'GET', data, token, now = started + 1000 } = {}) {
    const headers = { Origin: 'https://tech-week-2026-guide.aaron-he-zhu.workers.dev' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    const original = Date.now;
    Date.now = () => now;
    try {
      const response = await worker.fetch(
        new Request('https://api.example' + path, {
          method,
          headers,
          body: data === undefined ? undefined : JSON.stringify(data),
        }),
        { DB, SITE_URL: headers.Origin },
        { waitUntil: (p) => p.catch(() => {}) },
      );
      return { status: response.status, data: await response.json() };
    } finally {
      Date.now = original;
    }
  }
  return {
    DB,
    call,
    session: async () => (await call('/v1/session', { method: 'POST', data: {} })).data.token,
  };
}
const address = { address: '测试场地 · 123 Example Street, San Francisco', note: '测试入口' };

test('homepage totals reflect current contributions without creating an identity or exposing content', async () => {
  const { call, session, DB } = fixture();
  const totals = async () => {
    const r = await call('/v1/community/stats');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.data).sort(), [
      'addressCount',
      'addressEventCount',
      'computedAt',
    ]);
    assert.equal(typeof r.data.computedAt, 'number');
    return [r.data.addressCount, r.data.addressEventCount];
  };
  assert.deepEqual(await totals(), [0, 0]);
  assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 0);
  const a = await session(),
    b = await session();
  const save = (token, event = id) =>
    call('/v1/addresses/' + event, { method: 'PUT', data: address, token });
  await save(a);
  await save(a);
  assert.deepEqual(await totals(), [1, 1]);
  await save(b);
  await save(a, future);
  assert.deepEqual(await totals(), [3, 2]);
  await call('/v1/addresses/' + id, { method: 'DELETE', token: b });
  assert.deepEqual(await totals(), [2, 2]);
  await call('/v1/addresses/' + future, { method: 'DELETE', token: a });
  assert.deepEqual(await totals(), [1, 1]);
  await call('/v1/addresses/' + id, { method: 'DELETE', token: a });
  assert.deepEqual(await totals(), [0, 0]);
});

test('address contributions persist, update without duplicates, and are isolated by identity', async () => {
  const { call, session } = fixture(),
    a = await session(),
    b = await session();
  assert.equal((await call('/v1/addresses/' + id, { method: 'PUT', data: address })).status, 401);
  assert.equal(
    (await call('/v1/addresses/' + id, { method: 'PUT', data: address, token: a })).status,
    200,
  );
  await call('/v1/addresses/' + id, {
    method: 'PUT',
    data: { ...address, address: 'Updated address, San Francisco' },
    token: a,
  });
  await call('/v1/addresses/' + id, {
    method: 'PUT',
    data: { ...address, note: '另一位访客的说明' },
    token: b,
  });
  const publicResult = (await call('/v1/events/' + id + '/community')).data;
  assert.equal(publicResult.addressCount, 2);
  assert.equal(publicResult.mine, null);
  assert.equal(
    (await call('/v1/events/' + id + '/community', { token: a })).data.mine.address.address,
    'Updated address, San Francisco',
  );
  await call('/v1/addresses/' + id, { method: 'DELETE', token: b });
  assert.equal((await call('/v1/events/' + id + '/community', { token: a })).data.addressCount, 1);
  await call('/v1/addresses/' + id, { method: 'DELETE', token: a });
  assert.equal((await call('/v1/events/' + id + '/community')).data.addressCount, 0);
});

test('ratings require confirmed attendance, integer 1–5 scores and a started activity', async () => {
  const { call, session } = fixture(),
    token = await session();
  for (const score of [0, 6, 1.5, '5', null])
    assert.equal(
      (await call('/v1/ratings/' + id, { method: 'PUT', data: { score, attended: true }, token }))
        .status,
      400,
    );
  assert.equal(
    (await call('/v1/ratings/' + id, { method: 'PUT', data: { score: 5, attended: false }, token }))
      .status,
    400,
  );
  assert.equal(
    (
      await call('/v1/ratings/' + future, {
        method: 'PUT',
        data: { score: 5, attended: true },
        token,
      })
    ).status,
    409,
  );
  assert.equal((await call('/v1/events/' + future + '/community')).data.canRate, false);
  assert.equal(
    (
      await call('/v1/ratings/' + future, {
        method: 'PUT',
        data: { score: 5, attended: true },
        token,
        now: futureStart,
      })
    ).status,
    200,
  );
  // Addresses may be shared before the event, independently of attendance or Wishlist.
  assert.equal(
    (await call('/v1/addresses/' + future, { method: 'PUT', data: address, token })).status,
    200,
  );
  assert.equal((await call('/v1/me', { token })).data.wishes.length, 0);
});

test('rating changes and withdrawal correctly update averages, count and public nickname', async () => {
  const { call, session } = fixture(),
    a = await session(),
    b = await session();
  const rate = (token, score) =>
    call('/v1/ratings/' + id, { method: 'PUT', data: { score, attended: true }, token });
  await rate(a, 5);
  await rate(a, 5);
  await rate(b, 3);
  let summary = (await call('/v1/summary?ids=' + id)).data.events[id];
  assert.equal(summary.ratingCount, 2);
  assert.equal(summary.ratingAverage, 4);
  await rate(a, 2);
  summary = (await call('/v1/summary?ids=' + id)).data.events[id];
  assert.equal(summary.ratingCount, 2);
  assert.equal(summary.ratingAverage, 2.5);
  await call('/v1/me', { method: 'PATCH', data: { nickname: '修改后的昵称' }, token: a });
  let result = (await call('/v1/events/' + id + '/community', { token: a })).data;
  assert.equal(result.mine.rating.score, 2);
  assert.ok(result.ratings.some((r) => r.nickname === '修改后的昵称' && r.score === 2));
  assert.ok(!JSON.stringify(result).includes(a));
  assert.ok(!JSON.stringify(result).includes('visitor_id'));
  await call('/v1/ratings/' + id, { method: 'DELETE', token: b });
  result = (await call('/v1/events/' + id + '/community')).data;
  assert.equal(result.ratingCount, 1);
  assert.equal(result.ratingAverage, 2);
  await call('/v1/ratings/' + id, { method: 'DELETE', token: a });
  result = (await call('/v1/events/' + id + '/community')).data;
  assert.equal(result.ratingAverage, null);
  assert.equal(result.ratingCount, 0);
});

test('input limits, invalid activities and shared read-only credentials are enforced', async () => {
  const { call, session } = fixture(),
    token = await session();
  for (const data of [
    null,
    [],
    { address: '' },
    { address: 'ab' },
    { address: 'x'.repeat(301) },
    { address: 'abc\u0000bad' },
    { address: 'abc', note: 4 },
  ])
    assert.equal((await call('/v1/addresses/' + id, { method: 'PUT', data, token })).status, 400);
  assert.equal(
    (
      await call('/v1/addresses/' + id, {
        method: 'PUT',
        data: { address: 'x'.repeat(9000) },
        token,
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await call('/v1/addresses/00000000-0000-0000-0000-000000000000', {
        method: 'PUT',
        data: address,
        token,
      })
    ).status,
    404,
  );
  const share = (await call('/v1/share', { method: 'POST', data: { enabled: true }, token })).data
    .shareToken;
  for (const kind of ['addresses', 'ratings'])
    assert.equal(
      (await call('/v1/' + kind + '/' + id, { method: 'DELETE', token: share })).status,
      401,
    );
  assert.equal((await call('/v1/events/' + id + '/community?offset=-1')).status, 400);
  assert.equal((await call('/v1/events/' + id + '/community?kind=unknown')).status, 400);
  assert.equal(
    (
      await call('/v1/addresses/' + id, {
        method: 'PUT',
        data: { address: 'Line 1\nLine 2' },
        token,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call('/v1/events/' + id + '/community')).data.addresses[0].address,
    'Line 1 Line 2',
  );
});

test('public lists paginate independently without exposing ownership identifiers', async () => {
  const { call, DB } = fixture();
  for (let i = 0; i < 23; i++) {
    const visitor = 'test-' + i;
    DB.sql
      .prepare('INSERT INTO visitors(id,token_hash,nickname,created_at) VALUES(?,?,?,?)')
      .run(visitor, 'hash' + i, '访客' + i, i);
    DB.sql
      .prepare(
        'INSERT INTO address_tips(visitor_id,event_id,address,note,updated_at) VALUES(?,?,?,?,?)',
      )
      .run(visitor, id, 'Address ' + i, '', i);
    DB.sql
      .prepare('INSERT INTO ratings(visitor_id,event_id,score,updated_at) VALUES(?,?,?,?)')
      .run(visitor, id, 5, i);
  }
  const first = (await call('/v1/events/' + id + '/community')).data;
  assert.equal(first.addresses.length, 20);
  assert.equal(first.nextAddresses, 20);
  assert.equal(first.ratings.length, 20);
  assert.equal(first.nextRatings, 20);
  const next = (await call('/v1/events/' + id + '/community?kind=addresses&offset=20')).data;
  assert.equal(next.addresses.length, 3);
  assert.equal(next.nextAddresses, null);
  assert.equal(next.ratings.length, 0);
  assert.equal(new Set([...first.addresses, ...next.addresses].map((r) => r.nickname)).size, 23);
  assert.ok(!JSON.stringify(first).includes('token_hash'));
  assert.ok(!JSON.stringify(first).includes('visitor_id'));
});

test('public address index contains only current counts and updates after the last withdrawal', async () => {
  const { call, DB } = fixture();
  try {
    const create = () => call('/v1/session', { method: 'POST', data: {} });
    const a = (await create()).data.token,
      b = (await create()).data.token;
    const write = (token, address) =>
      call('/v1/addresses/' + id, {
        method: 'PUT',
        token,
        data: { address, note: 'Synthetic test' },
      });
    assert.deepEqual((await call('/v1/community/address-events')).data.events, {});
    await write(a, 'Synthetic address A');
    await write(b, 'Synthetic address B');
    await write(a, 'Edited synthetic address');
    let response = await call('/v1/community/address-events');
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.events, { [id]: 2 });
    assert.deepEqual(Object.keys(response.data).sort(), ['computedAt', 'events']);
    assert.ok(!JSON.stringify(response.data).includes('Synthetic'));
    for (const token of [a, b]) await call('/v1/addresses/' + id, { method: 'DELETE', token });
    response = await call('/v1/community/address-events');
    assert.deepEqual(response.data.events, {});
  } finally {
    DB.sql.close();
  }
});

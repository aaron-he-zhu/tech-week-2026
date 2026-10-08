import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, readJson } from '../backend/http.mjs';
import worker from '../backend/worker.mjs';
import { database } from './d1-local.mjs';
import { EVENT_IDS } from '../backend/event-ids.mjs';

const request = (body, contentType = 'application/json') =>
  new Request('https://api.example/v1/session', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });

test('JSON endpoints reject null, arrays, primitives and malformed JSON with 400', async () => {
  const db = database();
  try {
    for (const value of ['null', '[]', 'true', '1', '"text"', '{']) {
      const response = await worker.fetch(request(value), { DB: db });
      assert.equal(response.status, 400, value);
    }
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 0);
  } finally {
    db.sql.close();
  }
});

test('JSON media types support parameters and reject prefix lookalikes', async () => {
  assert.deepEqual(await readJson(request('{}', 'Application/JSON; charset=utf-8')), {});
  await assert.rejects(
    readJson(request('{}', 'application/json-invalid')),
    (error) => error instanceof ApiError && error.status === 415,
  );
});

test('streamed JSON size is bounded without trusting Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8193));
    },
    cancel() {
      cancelled = true;
    },
  });
  const input = new Request('https://api.example', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  });
  await assert.rejects(readJson(input), (error) => error.status === 413);
  assert.equal(cancelled, true);
});

test('invalid UTF-8 is rejected instead of silently changing submitted text', async () => {
  await assert.rejects(
    readJson(request(new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]))),
    (error) => error.status === 400,
  );
});

test('CORS uses the configured site and fails closed for other origins', async () => {
  const db = database();
  const origin = 'https://fork.example';
  const input = (value) =>
    new Request('https://api.example/v1/counts', { headers: { Origin: value } });
  try {
    const response = await worker.fetch(input(origin), { DB: db, SITE_URL: origin });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(
      (await worker.fetch(input('https://unrelated.example'), { DB: db, SITE_URL: origin })).status,
      403,
    );
    assert.equal((await worker.fetch(input(origin), { DB: db })).status, 403);
  } finally {
    db.sql.close();
  }
});

test('saved event statuses are limited to known values before storage', async () => {
  const db = database();
  try {
    const identity = await (await worker.fetch(request('{}'), { DB: db })).json();
    const input = new Request('https://api.example/v1/wishes/' + EVENT_IDS[0], {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + identity.token },
      body: JSON.stringify({
        snapshot: {
          name: 'Synthetic event',
          city: 'sf',
          date: '2026-10-05',
          time: '10:00',
          endDate: '',
          endTime: '',
          url: 'https://www.tech-week.com/calendar/sf/events/test',
          place: '',
          status: 'future',
        },
      }),
    });
    assert.equal((await worker.fetch(input, { DB: db })).status, 400);
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM wishes').get().n, 0);
  } finally {
    db.sql.close();
  }
});

test('authentication rejects prefixless credentials so challenge and logout parse the same token', async () => {
  const db = database();
  try {
    const created = await worker.fetch(request('{}'), { DB: db });
    const { token } = await created.json();
    for (const path of ['/v1/me', '/v1/auth/logout', '/v1/auth/challenge']) {
      for (const authorization of [token, 'bearer ' + token, 'BearerX ' + token]) {
        const response = await worker.fetch(
          new Request('https://api.example' + path, {
            method: path === '/v1/me' ? 'GET' : 'POST',
            headers: { Authorization: authorization },
          }),
          { DB: db },
        );
        assert.equal(response.status, 401, path);
      }
    }
    const response = await worker.fetch(
      new Request('https://api.example/v1/me', {
        headers: { Authorization: 'Bearer ' + token },
      }),
      { DB: db },
    );
    assert.equal(response.status, 200);
  } finally {
    db.sql.close();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { database } from './d1-local.mjs';
import { EVENT_IDS } from '../backend/event-ids.mjs';
import {
  verifyGoogleCredential,
  mergeGoogleIdentity,
  createChallenge,
  findIdentity,
  digest,
  randomToken,
} from '../backend/google-auth.mjs';
import worker from '../backend/worker.mjs';

const clientId = '123456789-test.apps.googleusercontent.com',
  id = EVENT_IDS[0],
  other = EVENT_IDS[1];
const keys = await generateKeyPair('RS256');
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
async function jwt(overrides = {}, key = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: 'https://accounts.google.com',
    aud: clientId,
    sub: 'google-user-1',
    iat: now,
    exp: now + 300,
    nonce: 'test-nonce',
    email: 'private@example.com',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .sign(key);
}
async function guest(db, nickname = '访客') {
  const token = randomToken(),
    hash = await digest(token),
    visitorId = crypto.randomUUID();
  await db
    .prepare('INSERT INTO visitors(id,token_hash,nickname,created_at) VALUES(?,?,?,?)')
    .bind(visitorId, hash, nickname, Date.now())
    .run();
  return { token, hash, visitor: await findIdentity(db, hash) };
}
function seed(db, visitorId, eventId, score, updatedAt) {
  db.sql
    .prepare('INSERT INTO wishes(visitor_id,event_id,snapshot,created_at) VALUES(?,?,?,?)')
    .run(visitorId, eventId, JSON.stringify({ name: '测试活动' }), updatedAt);
  db.sql
    .prepare(
      'INSERT INTO address_tips(visitor_id,event_id,address,note,updated_at) VALUES(?,?,?,?,?)',
    )
    .run(visitorId, eventId, 'Address ' + updatedAt, '', updatedAt);
  db.sql
    .prepare('INSERT INTO ratings(visitor_id,event_id,score,updated_at) VALUES(?,?,?,?)')
    .run(visitorId, eventId, score, updatedAt);
}
async function login(db, source, sub = 'google-user-1') {
  const c = await createChallenge(db, source.hash);
  const result = await mergeGoogleIdentity(
    db,
    source.visitor,
    source.hash,
    c.challengeId,
    { sub, nonce: c.nonce, email: 'private@example.com' },
    fail,
  );
  return { ...result, hash: await digest(result.token), challenge: c };
}

test('Google ID tokens require valid signatures, issuer, audience, expiry, age and nonce', async () => {
  assert.deepEqual(await verifyGoogleCredential(await jwt(), clientId, keys.publicKey), {
    sub: 'google-user-1',
    nonce: 'test-nonce',
    email: 'private@example.com',
  });
  for (const payload of [
    { aud: 'another-client' },
    { iss: 'https://evil.example' },
    { exp: 1 },
    { iat: 1 },
    { nonce: undefined },
    { sub: '' },
    { azp: 'another-client' },
  ])
    await assert.rejects(verifyGoogleCredential(await jwt(payload), clientId, keys.publicKey));
  const otherKeys = await generateKeyPair('RS256');
  await assert.rejects(
    verifyGoogleCredential(await jwt({}, otherKeys.privateKey), clientId, keys.publicKey),
  );
});

test('first login retains nickname and contributions while retiring anonymous recovery and sharing credentials', async () => {
  const db = database(),
    a = await guest(db, '自选昵称');
  seed(db, a.visitor.id, id, 4, 100);
  await db
    .prepare('UPDATE visitors SET share_token=? WHERE id=?')
    .bind('old-public-link', a.visitor.id)
    .run();
  const result = await login(db, a);
  assert.equal(result.visitor.nickname, '自选昵称');
  assert.equal(result.visitor.google_sub, 'google-user-1');
  assert.equal(await findIdentity(db, a.hash), null);
  assert.equal(result.visitor.share_token, null);
  for (const table of ['wishes', 'address_tips', 'ratings'])
    assert.equal(
      db.sql.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE visitor_id=?`).get(result.visitor.id)
        .n,
      1,
    );
  assert.equal(
    db.sql.prepare('SELECT COUNT(*) AS n FROM visitors WHERE id=?').get(a.visitor.id).n,
    0,
  );
  assert.ok(!result.visitor.nickname.includes('private'));
});

test('cross-device merge deduplicates wishes and uses newest address/rating while retaining the account nickname', async () => {
  const db = database(),
    a = await guest(db, '原昵称');
  seed(db, a.visitor.id, id, 4, 200);
  const first = await login(db, a);
  const b = await guest(db, '第二设备昵称');
  seed(db, b.visitor.id, id, 2, 300);
  seed(db, b.visitor.id, other, 5, 300);
  const second = await login(db, b);
  assert.equal(first.visitor.id, second.visitor.id);
  assert.equal(second.visitor.nickname, '原昵称');
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM wishes').get().n, 2);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM ratings WHERE event_id=?').get(id).n, 1);
  assert.equal(db.sql.prepare('SELECT score FROM ratings WHERE event_id=?').get(id).score, 2);
  assert.equal(
    db.sql.prepare('SELECT address FROM address_tips WHERE event_id=?').get(id).address,
    'Address 300',
  );
  assert.ok(await findIdentity(db, first.hash));
  assert.ok(await findIdentity(db, second.hash));
  const c = await guest(db);
  seed(db, c.visitor.id, id, 1, 50);
  await login(db, c);
  assert.equal(db.sql.prepare('SELECT score FROM ratings WHERE event_id=?').get(id).score, 2);
});

test('nonce is session-bound, one-use, expires and must match the verified token', async () => {
  const db = database(),
    a = await guest(db),
    b = await guest(db),
    c = await createChallenge(db, a.hash);
  const identity = { sub: 'google-user-1', nonce: c.nonce, email: '' };
  await assert.rejects(mergeGoogleIdentity(db, b.visitor, b.hash, c.challengeId, identity, fail), {
    status: 401,
  });
  await assert.rejects(
    mergeGoogleIdentity(
      db,
      a.visitor,
      a.hash,
      c.challengeId,
      { ...identity, nonce: 'wrong' },
      fail,
    ),
    { status: 401 },
  );
  const first = await mergeGoogleIdentity(db, a.visitor, a.hash, c.challengeId, identity, fail);
  await assert.rejects(mergeGoogleIdentity(db, a.visitor, a.hash, c.challengeId, identity, fail), {
    status: 409,
  });
  const logged = { ...first, hash: await digest(first.token) };
  const expired = await createChallenge(db, logged.hash);
  await db
    .prepare('UPDATE google_challenges SET expires_at=1 WHERE id=?')
    .bind(expired.challengeId)
    .run();
  await assert.rejects(
    mergeGoogleIdentity(
      db,
      logged.visitor,
      logged.hash,
      expired.challengeId,
      { ...identity, nonce: expired.nonce },
      fail,
    ),
    { status: 401 },
  );
});

test('a stale merge cannot copy or delete data, and different Google accounts cannot be silently merged', async () => {
  const db = database(),
    a = await guest(db);
  seed(db, a.visitor.id, id, 4, 100);
  const stale = await createChallenge(db, a.hash),
    first = await login(db, a);
  await assert.rejects(
    mergeGoogleIdentity(
      db,
      a.visitor,
      a.hash,
      stale.challengeId,
      { sub: 'different-google-user', nonce: stale.nonce, email: '' },
      fail,
    ),
    { status: 409 },
  );
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM google_accounts').get().n, 1);
  const challenge = await createChallenge(db, first.hash);
  await assert.rejects(
    mergeGoogleIdentity(
      db,
      first.visitor,
      first.hash,
      challenge.challengeId,
      { sub: 'different-google-user', nonce: challenge.nonce, email: '' },
      fail,
    ),
    { status: 409 },
  );
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM ratings').get().n, 1);
});

test('a failed database merge rolls back all transfers and nonce consumption', async () => {
  const db = database(),
    a = await guest(db);
  seed(db, a.visitor.id, id, 5, 100);
  db.sql.exec(
    "CREATE TRIGGER fail_merge BEFORE INSERT ON ratings WHEN NEW.visitor_id LIKE 'google-%' BEGIN SELECT RAISE(ABORT,'forced merge failure'); END;",
  );
  await assert.rejects(login(db, a));
  assert.ok(await findIdentity(db, a.hash));
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM google_accounts').get().n, 0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM google_login_uses').get().n, 0);
  assert.equal(
    db.sql.prepare('SELECT COUNT(*) AS n FROM wishes WHERE visitor_id=?').get(a.visitor.id).n,
    1,
  );
});

test('Google session logout and expiry preserve cloud records and do not leak account email publicly', async () => {
  const db = database(),
    a = await guest(db, '公开昵称');
  seed(db, a.visitor.id, id, 5, 100);
  const first = await login(db, a);
  const b = await guest(db),
    second = await login(db, b);
  const call = async (path, token, method = 'GET') => {
    const r = await worker.fetch(
      new Request('https://api.example' + path, {
        method,
        headers: {
          Origin: 'https://tech-week-2026-guide.aaron-he-zhu.workers.dev',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        ...(method === 'POST' ? { body: '{}' } : {}),
      }),
      {
        DB: db,
        GOOGLE_CLIENT_ID: clientId,
        SITE_URL: 'https://tech-week-2026-guide.aaron-he-zhu.workers.dev',
      },
      {},
    );
    return { status: r.status, data: await r.json() };
  };
  assert.equal((await call('/v1/me', first.token)).data.google.email, 'private@example.com');
  for (const path of [
    '/v1/summary?ids=' + id,
    '/v1/events/' + id + '/community',
    '/v1/events/' + id + '/people',
  ])
    assert.ok(!JSON.stringify((await call(path)).data).includes('private@example.com'));
  assert.equal((await call('/v1/auth/logout', first.token, 'POST')).status, 200);
  assert.equal((await call('/v1/me', first.token)).status, 401);
  assert.equal((await call('/v1/me', second.token)).data.wishes.length, 1);
  await db
    .prepare('UPDATE visitor_sessions SET expires_at=1 WHERE token_hash=?')
    .bind(second.hash)
    .run();
  assert.equal((await call('/v1/me', second.token)).status, 401);
  const third = await login(db, await guest(db));
  assert.equal((await call('/v1/me', third.token)).data.wishes.length, 1);
});

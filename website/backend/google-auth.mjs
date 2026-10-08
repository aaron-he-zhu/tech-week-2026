import { digest, randomToken } from './credentials.mjs';
export { digest, randomToken } from './credentials.mjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const googleClientId = (env) =>
  /^\d+-[a-z\d-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID || '')
    ? env.GOOGLE_CLIENT_ID
    : null;

export async function verifyGoogleCredential(credential, clientId, keys = KEYS) {
  const { payload } = await jwtVerify(credential, keys, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
    maxTokenAge: '10m',
    clockTolerance: 5,
  });
  if (
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 255 ||
    typeof payload.nonce !== 'string'
  )
    throw new Error('Invalid Google identity');
  if (payload.azp && payload.azp !== clientId) throw new Error('Invalid authorized party');
  return {
    sub: payload.sub,
    nonce: payload.nonce,
    email: typeof payload.email === 'string' ? payload.email.slice(0, 320) : '',
  };
}

export async function findIdentity(db, hash) {
  return db
    .prepare(
      `SELECT v.id,v.nickname,v.share_token,g.google_sub,g.email FROM visitors v
  LEFT JOIN google_accounts g ON g.visitor_id=v.id
  WHERE v.token_hash=? OR v.id IN (SELECT visitor_id FROM visitor_sessions WHERE token_hash=? AND expires_at>?) LIMIT 1`,
    )
    .bind(hash, hash, Date.now())
    .first();
}

export async function createChallenge(db, sessionHash) {
  const id = randomToken(),
    nonce = randomToken();
  await db
    .prepare('INSERT INTO google_challenges(id,nonce_hash,session_hash,expires_at) VALUES(?,?,?,?)')
    .bind(id, await digest(nonce), sessionHash, Date.now() + 600000)
    .run();
  await db.prepare('DELETE FROM google_challenges WHERE expires_at<?').bind(Date.now()).run();
  return { challengeId: id, nonce };
}

// All merge writes and nonce consumption commit together. The NOT NULL / UNIQUE
// constraint on google_login_uses rejects missing, expired, stale or replayed logins.
export async function mergeGoogleIdentity(db, source, sessionHash, challengeId, identity, fail) {
  if (source.google_sub && source.google_sub !== identity.sub)
    fail(409, '请先退出当前账号，再登录其他 Google 账号');
  const challenge = await db
    .prepare(
      'SELECT nonce_hash FROM google_challenges WHERE id=? AND session_hash=? AND expires_at>?',
    )
    .bind(challengeId, sessionHash, Date.now())
    .first();
  if (!challenge || challenge.nonce_hash !== (await digest(identity.nonce)))
    fail(401, '登录已失效，请重新点击 Google 登录');
  const target = 'google-' + (await digest(identity.sub)),
    token = randomToken(),
    hash = await digest(token),
    now = Date.now();
  const statements = [
    db
      .prepare(
        `INSERT INTO google_login_uses(challenge_id) VALUES((SELECT c.id FROM google_challenges c
   WHERE c.id=? AND c.session_hash=? AND c.expires_at>? AND c.nonce_hash=? AND EXISTS(
    SELECT 1 FROM visitors v WHERE v.id=? AND (v.token_hash=? OR EXISTS(
     SELECT 1 FROM visitor_sessions s WHERE s.visitor_id=v.id AND s.token_hash=? AND s.expires_at>?)))))`,
      )
      .bind(
        challengeId,
        sessionHash,
        now,
        challenge.nonce_hash,
        source.id,
        sessionHash,
        sessionHash,
        now,
      ),
    db
      .prepare(
        'INSERT INTO visitors(id,token_hash,nickname,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING',
      )
      .bind(target, await digest(randomToken()), source.nickname, now),
    db
      .prepare(
        'INSERT INTO google_accounts(google_sub,visitor_id,email) VALUES(?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email',
      )
      .bind(identity.sub, target, identity.email),
  ];
  if (source.id !== target) {
    statements.push(
      db
        .prepare(
          `INSERT INTO wishes(visitor_id,event_id,snapshot,created_at) SELECT ?,event_id,snapshot,created_at FROM wishes WHERE visitor_id=?
    ON CONFLICT(visitor_id,event_id) DO UPDATE SET created_at=MIN(wishes.created_at,excluded.created_at)`,
        )
        .bind(target, source.id),
      db
        .prepare(
          `INSERT INTO address_tips(visitor_id,event_id,address,note,updated_at) SELECT ?,event_id,address,note,updated_at FROM address_tips WHERE visitor_id=?
    ON CONFLICT(visitor_id,event_id) DO UPDATE SET address=excluded.address,note=excluded.note,updated_at=excluded.updated_at WHERE excluded.updated_at>address_tips.updated_at`,
        )
        .bind(target, source.id),
      db
        .prepare(
          `INSERT INTO ratings(visitor_id,event_id,score,updated_at) SELECT ?,event_id,score,updated_at FROM ratings WHERE visitor_id=?
    ON CONFLICT(visitor_id,event_id) DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at WHERE excluded.updated_at>ratings.updated_at`,
        )
        .bind(target, source.id),
      db
        .prepare('UPDATE transcript_entries SET visitor_id=?,legacy_key=NULL WHERE visitor_id=?')
        .bind(target, source.id),
      db
        .prepare(
          'DELETE FROM visitors WHERE id=? AND NOT EXISTS(SELECT 1 FROM google_accounts WHERE visitor_id=?)',
        )
        .bind(source.id, source.id),
    );
  }
  statements.push(
    db
      .prepare('INSERT INTO visitor_sessions(token_hash,visitor_id,expires_at) VALUES(?,?,?)')
      .bind(hash, target, now + 30 * 86400000),
    db
      .prepare('DELETE FROM visitor_sessions WHERE token_hash=? OR expires_at<?')
      .bind(sessionHash, now),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    if (/constraint|UNIQUE|NOT NULL/i.test(String(error.message)))
      fail(409, '登录状态已变化，请刷新页面后重试');
    throw error;
  }
  return { token, visitor: await findIdentity(db, hash), merged: source.id !== target };
}

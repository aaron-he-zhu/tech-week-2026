import { digest, randomToken } from './credentials.mjs';
import { ApiError, fail, readJson as body } from './http.mjs';
import { hasUnsafeCharacters } from './validation.mjs';
import { EVENT_IDS } from './event-ids.mjs';
import { addCommunitySummary, readCommunity, writeCommunity } from './community.mjs';
import {
  googleClientId,
  findIdentity,
  createChallenge,
  verifyGoogleCredential,
  mergeGoogleIdentity,
} from './google-auth.mjs';
const IDS = new Set(EVENT_IDS);
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/;
const TOKEN = /^[a-f\d]{64}$/;
async function auth(request, db) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f\d]{64})$/)?.[1];
  if (!TOKEN.test(token || '')) fail(401, '请先恢复或创建你的 Wishlist');
  const visitor = await findIdentity(db, await digest(token));
  if (!visitor) fail(401, '这个恢复链接无效');
  return visitor;
}
async function limits(request, db, kind, max) {
  const now = Math.floor(Date.now() / 1000),
    window = Math.floor(now / 3600);
  const bucket = await digest(
    `${kind}:${window}:${request.headers.get('CF-Connecting-IP') || 'local'}`,
  );
  const row = await db
    .prepare(
      'INSERT INTO rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits',
    )
    .bind(bucket, now + 7200)
    .first();
  if (row.hits > max) fail(429, '操作太频繁，请稍后再试');
}
async function wishes(db, id) {
  return (
    await db
      .prepare(
        'SELECT event_id,snapshot,created_at FROM wishes WHERE visitor_id=? ORDER BY created_at,event_id',
      )
      .bind(id)
      .all()
  ).results.map((r) => ({
    id: r.event_id,
    snapshot: JSON.parse(r.snapshot),
    savedAt: r.created_at,
  }));
}
async function total(db, id) {
  return (
    await db.prepare('SELECT COUNT(*) AS count FROM wishes WHERE event_id=?').bind(id).first()
  ).count;
}
function snapshot(value, id) {
  if (!value || typeof value !== 'object') fail(400, '缺少活动信息');
  const result = { id };
  for (const [key, max] of Object.entries({
    name: 300,
    city: 2,
    date: 10,
    time: 5,
    endDate: 10,
    endTime: 5,
    url: 1000,
    place: 400,
    status: 16,
  })) {
    if (typeof value[key] !== 'string' || value[key].length > max) fail(400, '活动信息不正确');
    result[key] = value[key];
  }
  if (
    !['sf', 'la'].includes(result.city) ||
    !['open', 'waitlist', 'full', 'closed', 'unknown'].includes(result.status) ||
    !/^2026-\d\d-\d\d$/.test(result.date) ||
    !/^\d\d:\d\d$/.test(result.time)
  )
    fail(400, '活动信息不正确');
  let url;
  try {
    url = new URL(result.url);
  } catch {
    fail(400, '活动链接不正确');
  }
  if (
    url.protocol !== 'https:' ||
    !['www.tech-week.com', 'tech-week.com'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    fail(400, '活动链接不正确');
  return JSON.stringify(result);
}
async function route(request, env, ctx) {
  const db = env.DB;
  if (!db) fail(503, '收藏服务暂不可用，请稍后再试');
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  const anonymous = url.searchParams.get('lang') === 'en' ? 'Anonymous visitor' : '匿名访客';
  if (path === '/v1/auth/config' && method === 'GET')
    return { googleClientId: googleClientId(env) };
  if (path === '/v1/community/stats' && method === 'GET') {
    const stats = await db
      .prepare(
        'SELECT COUNT(*) AS addressCount,COUNT(DISTINCT event_id) AS addressEventCount FROM address_tips',
      )
      .first();
    return { ...stats, computedAt: Date.now() };
  }
  if (path === '/v1/community/address-events' && method === 'GET') {
    const rows = (
      await db
        .prepare('SELECT event_id,COUNT(*) AS count FROM address_tips GROUP BY event_id')
        .all()
    ).results;
    return {
      events: Object.fromEntries(rows.map((row) => [row.event_id, row.count])),
      computedAt: Date.now(),
    };
  }
  if (path === '/v1/counts' && method === 'GET') {
    const rows = (
      await db.prepare('SELECT event_id,COUNT(*) AS count FROM wishes GROUP BY event_id').all()
    ).results;
    return { counts: Object.fromEntries(rows.map((r) => [r.event_id, r.count])) };
  }
  if (path === '/v1/summary' && method === 'GET') {
    const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter(Boolean))];
    if (ids.length > 24 || ids.some((id) => !UUID.test(id))) fail(400, '活动编号不正确');
    if (!ids.length) return { events: {} };
    const marks = ids.map(() => '?').join(',');
    const counts = (
      await db
        .prepare(
          `SELECT event_id,COUNT(*) AS count FROM wishes WHERE event_id IN (${marks}) GROUP BY event_id`,
        )
        .bind(...ids)
        .all()
    ).results;
    const names = (
      await db
        .prepare(
          `SELECT event_id,nickname FROM (SELECT w.event_id,v.nickname,ROW_NUMBER() OVER(PARTITION BY w.event_id ORDER BY w.created_at,w.visitor_id) AS rank FROM wishes w JOIN visitors v ON v.id=w.visitor_id WHERE w.event_id IN (${marks})) WHERE rank<=3`,
        )
        .bind(...ids)
        .all()
    ).results;
    const events = Object.fromEntries(ids.map((id) => [id, { count: 0, names: [] }]));
    for (const row of counts) events[row.event_id].count = row.count;
    for (const row of names) events[row.event_id].names.push(row.nickname || anonymous);
    await addCommunitySummary(db, ids, events);
    return { events };
  }
  if (path === '/v1/session' && method === 'POST') {
    await body(request);
    await limits(request, db, 'session', 20);
    const token = randomToken(),
      id = crypto.randomUUID();
    await db
      .prepare('INSERT INTO visitors(id,token_hash,created_at) VALUES(?,?,?)')
      .bind(id, await digest(token), Date.now())
      .run();
    ctx?.waitUntil(
      db
        .prepare('DELETE FROM rate_limits WHERE expires_at<?')
        .bind(Math.floor(Date.now() / 1000))
        .run(),
    );
    return { token, nickname: '', wishes: [] };
  }
  const people = path.match(/^\/v1\/events\/([a-f\d-]+)\/people$/);
  if (people && method === 'GET') {
    const id = people[1];
    if (!UUID.test(id)) fail(400, '活动编号不正确');
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000) fail(400, '页码不正确');
    const count = await total(db, id);
    const rows = (
      await db
        .prepare(
          'SELECT v.nickname FROM wishes w JOIN visitors v ON v.id=w.visitor_id WHERE w.event_id=? ORDER BY w.created_at,w.visitor_id LIMIT 50 OFFSET ?',
        )
        .bind(id, offset)
        .all()
    ).results;
    return {
      count,
      names: rows.map((r) => r.nickname || anonymous),
      next: offset + rows.length < count ? offset + rows.length : null,
    };
  }
  const shared = path.match(/^\/v1\/shared\/([a-f\d]{64})$/);
  if (shared && method === 'GET') {
    const visitor = await db
      .prepare('SELECT id,nickname FROM visitors WHERE share_token=?')
      .bind(shared[1])
      .first();
    if (!visitor) fail(404, '分享链接已失效');
    return { nickname: visitor.nickname, wishes: await wishes(db, visitor.id) };
  }
  const community = path.match(/^\/v1\/events\/([a-f\d-]+)\/community$/);
  if (community && method === 'GET') {
    const id = community[1];
    if (!UUID.test(id)) fail(400, '活动编号不正确');
    const visitor = request.headers.has('authorization') ? await auth(request, db) : null;
    return readCommunity(db, id, visitor, url.searchParams, fail);
  }
  const visitor = await auth(request, db);
  if (path === '/v1/me' && method === 'GET')
    return {
      nickname: visitor.nickname,
      wishes: await wishes(db, visitor.id),
      google: visitor.google_sub ? { email: visitor.email } : null,
    };
  if (['PUT', 'PATCH', 'POST', 'DELETE'].includes(method)) await limits(request, db, 'write', 240);
  if (path === '/v1/auth/google/challenge' && method === 'POST') {
    if (!googleClientId(env)) fail(503, 'Google 登录暂未配置');
    await body(request);
    await limits(request, db, 'google', 30);
    return createChallenge(db, await digest(request.headers.get('authorization').slice(7)));
  }
  if (path === '/v1/auth/google' && method === 'POST') {
    const clientId = googleClientId(env);
    if (!clientId) fail(503, 'Google 登录暂未配置');
    await limits(request, db, 'google', 30);
    const data = await body(request);
    if (!data || typeof data.credential !== 'string' || !TOKEN.test(data.challengeId || ''))
      fail(400, 'Google 登录信息不正确');
    let identity;
    try {
      identity = await verifyGoogleCredential(data.credential, clientId);
    } catch {
      fail(401, 'Google 登录验证失败，请重新登录');
    }
    const result = await mergeGoogleIdentity(
      db,
      visitor,
      await digest(request.headers.get('authorization').slice(7)),
      data.challengeId,
      identity,
      fail,
    );
    return {
      token: result.token,
      merged: result.merged,
      nickname: result.visitor.nickname,
      wishes: await wishes(db, result.visitor.id),
      google: { email: result.visitor.email },
    };
  }
  if (path === '/v1/auth/logout' && method === 'POST') {
    await body(request);
    if (!visitor.google_sub) fail(400, '当前使用的是免注册身份');
    await db
      .prepare('DELETE FROM visitor_sessions WHERE token_hash=?')
      .bind(await digest(request.headers.get('authorization').slice(7)))
      .run();
    return { signedOut: true };
  }
  const contribution = path.match(/^\/v1\/(addresses|ratings)\/([a-f\d-]+)$/);
  if (contribution && ['PUT', 'DELETE'].includes(method)) {
    const [, kind, id] = contribution;
    if (!UUID.test(id)) fail(400, '活动编号不正确');
    if (method === 'PUT' && !IDS.has(id)) fail(404, '活动已移出当前日历，不能新增内容');
    return writeCommunity(
      db,
      id,
      visitor,
      kind,
      method,
      method === 'PUT' ? await body(request) : null,
      fail,
    );
  }
  if (path === '/v1/me' && method === 'PATCH') {
    const data = await body(request);
    if (typeof data.nickname !== 'string') fail(400, '请输入昵称');
    const nickname = data.nickname.normalize('NFC').trim();
    if ([...nickname].length > 24 || hasUnsafeCharacters(nickname))
      fail(400, '昵称最多 24 个字，请勿使用控制字符');
    await db.prepare('UPDATE visitors SET nickname=? WHERE id=?').bind(nickname, visitor.id).run();
    return { nickname };
  }
  const wish = path.match(/^\/v1\/wishes\/([a-f\d-]+)$/);
  if (wish && ['PUT', 'DELETE'].includes(method)) {
    const id = wish[1];
    if (!UUID.test(id)) fail(400, '活动编号不正确');
    if (method === 'PUT') {
      if (!IDS.has(id)) fail(404, '活动已移出当前日历，不能新加入');
      const data = await body(request),
        saved = snapshot(data.snapshot, id);
      await db
        .prepare(
          'INSERT INTO wishes(visitor_id,event_id,snapshot,created_at) VALUES(?,?,?,?) ON CONFLICT(visitor_id,event_id) DO NOTHING',
        )
        .bind(visitor.id, id, saved, Date.now())
        .run();
    } else
      await db
        .prepare('DELETE FROM wishes WHERE visitor_id=? AND event_id=?')
        .bind(visitor.id, id)
        .run();
    return { saved: method === 'PUT', count: await total(db, id) };
  }
  if (path === '/v1/share' && method === 'POST') {
    const data = await body(request);
    if (typeof data.enabled !== 'boolean') fail(400, '分享设置不正确');
    const token = data.enabled ? visitor.share_token || randomToken() : null;
    await db.prepare('UPDATE visitors SET share_token=? WHERE id=?').bind(token, visitor.id).run();
    return { shareToken: token };
  }
  fail(404, '接口不存在');
}
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin');
    const allowed =
      origin === env.SITE_URL ||
      (env.ALLOW_LOCAL === 'true' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin || ''));
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Origin',
    };
    if (allowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
      headers['Access-Control-Max-Age'] = '600';
    }
    if (origin && !allowed)
      return new Response(JSON.stringify({ error: '请求来源不允许' }), { status: 403, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      return new Response(JSON.stringify(await route(request, env, ctx)), { headers });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof ApiError ? error.message : '收藏服务暂不可用，请稍后重试',
        }),
        { status: error instanceof ApiError ? error.status : 503, headers },
      );
    }
  },
};

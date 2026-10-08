import { hasUnsafeCharacters } from './validation.mjs';
import { EVENT_STARTS } from './event-ids.mjs';

export async function addCommunitySummary(db, ids, events) {
  const marks = ids.map(() => '?').join(',');
  const addresses = (
    await db
      .prepare(
        `SELECT event_id,COUNT(*) AS count FROM address_tips WHERE event_id IN (${marks}) GROUP BY event_id`,
      )
      .bind(...ids)
      .all()
  ).results;
  const ratings = (
    await db
      .prepare(
        `SELECT event_id,COUNT(*) AS count,ROUND(AVG(score),1) AS average FROM ratings WHERE event_id IN (${marks}) GROUP BY event_id`,
      )
      .bind(...ids)
      .all()
  ).results;
  for (const id of ids)
    Object.assign(events[id], { addressCount: 0, ratingCount: 0, ratingAverage: null });
  for (const r of addresses) events[r.event_id].addressCount = r.count;
  for (const r of ratings)
    Object.assign(events[r.event_id], { ratingCount: r.count, ratingAverage: r.average });
}

export async function readCommunity(db, id, visitor, params, fail) {
  const kind = params.get('kind') || 'all',
    offset = Number(params.get('offset') || 0);
  if (
    !['all', 'addresses', 'ratings'].includes(kind) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000
  )
    fail(400, '页码不正确');
  const stats = { [id]: {} };
  await addCommunitySummary(db, [id], stats);
  const result = {
    ...stats[id],
    addresses: [],
    ratings: [],
    nextAddresses: null,
    nextRatings: null,
    canRate: Number.isFinite(EVENT_STARTS[id]) && Date.now() >= EVENT_STARTS[id],
    mine: null,
  };
  if (kind !== 'ratings') {
    result.addresses = (
      await db
        .prepare(
          'SELECT v.nickname,a.address,a.note,a.updated_at AS updatedAt FROM address_tips a JOIN visitors v ON v.id=a.visitor_id WHERE a.event_id=? ORDER BY a.updated_at DESC,a.visitor_id LIMIT 20 OFFSET ?',
        )
        .bind(id, offset)
        .all()
    ).results;
    result.nextAddresses =
      offset + result.addresses.length < result.addressCount
        ? offset + result.addresses.length
        : null;
  }
  if (kind !== 'addresses') {
    result.ratings = (
      await db
        .prepare(
          'SELECT v.nickname,r.score,r.updated_at AS updatedAt FROM ratings r JOIN visitors v ON v.id=r.visitor_id WHERE r.event_id=? ORDER BY r.updated_at DESC,r.visitor_id LIMIT 20 OFFSET ?',
        )
        .bind(id, offset)
        .all()
    ).results;
    result.nextRatings =
      offset + result.ratings.length < result.ratingCount ? offset + result.ratings.length : null;
  }
  if (visitor) {
    result.mine = {
      address: await db
        .prepare(
          'SELECT address,note,updated_at AS updatedAt FROM address_tips WHERE event_id=? AND visitor_id=?',
        )
        .bind(id, visitor.id)
        .first(),
      rating: await db
        .prepare(
          'SELECT score,updated_at AS updatedAt FROM ratings WHERE event_id=? AND visitor_id=?',
        )
        .bind(id, visitor.id)
        .first(),
    };
  }
  return result;
}

export async function writeCommunity(db, id, visitor, kind, method, data, fail) {
  const table = kind === 'addresses' ? 'address_tips' : 'ratings';
  if (method === 'DELETE') {
    await db
      .prepare(`DELETE FROM ${table} WHERE event_id=? AND visitor_id=?`)
      .bind(id, visitor.id)
      .run();
    return { removed: true };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, '内容格式不正确');
  if (kind === 'addresses') {
    const clean = (value, min, max) => {
      if (typeof value !== 'string') fail(400, '请输入地址和补充说明');
      const text = value
        .normalize('NFC')
        .replace(/[\r\n\t]+/g, ' ')
        .trim();
      if ([...text].length < min || [...text].length > max || hasUnsafeCharacters(text))
        fail(400, '地址与说明各最多 300 个字，请勿使用控制字符');
      return text;
    };
    const address = clean(data.address, 3, 300),
      note = clean(data.note ?? '', 0, 300);
    await db
      .prepare(
        'INSERT INTO address_tips(visitor_id,event_id,address,note,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(visitor_id,event_id) DO UPDATE SET address=excluded.address,note=excluded.note,updated_at=excluded.updated_at',
      )
      .bind(visitor.id, id, address, note, Date.now())
      .run();
  } else {
    if (!Number.isInteger(data.score) || data.score < 1 || data.score > 5 || data.attended !== true)
      fail(400, '请确认实际参加过，并选择 1–5 分');
    if (!Number.isFinite(EVENT_STARTS[id]) || Date.now() < EVENT_STARTS[id])
      fail(409, '活动尚未开始，参加后再来评分');
    await db
      .prepare(
        'INSERT INTO ratings(visitor_id,event_id,score,updated_at) VALUES(?,?,?,?) ON CONFLICT(visitor_id,event_id) DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at',
      )
      .bind(visitor.id, id, data.score, Date.now())
      .run();
  }
  return { saved: true };
}

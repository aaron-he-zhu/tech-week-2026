export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function fail(status, message) {
  throw new ApiError(status, message);
}

/** Bound streamed bodies too: clients are not required to send Content-Length. */
export async function readJson(request) {
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') fail(415, '请使用 JSON 请求');
  const maximumBytes = 8192;
  if (Number(request.headers.get('content-length') || 0) > maximumBytes) fail(413, '内容过长');
  const reader = request.body?.getReader();
  if (!reader) fail(400, '缺少内容');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximumBytes) {
      await reader.cancel();
      fail(413, '内容过长');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(400, '内容格式不正确');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(400, '内容格式不正确');
  }
  return value;
}

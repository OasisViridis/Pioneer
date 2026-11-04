import { execFileSync } from 'node:child_process';

// A plain rerun can resolve these; permanent input, scope or credential errors
// need a human to change something first.
const transientStates = new Set(['rate-limited', 'retryable-error']);
export const retryableState = (state) => transientStates.has(state);
const invalidInput = (message) =>
  Object.assign(new Error(message), { state: 'invalid-input' });

// Credentials stay in the transport; errors never echo server bodies or tokens.
export function remoteFailure(error) {
  const status = Number(error.status) || null;
  return {
    state: [401, 403].includes(status)
      ? 'permission-denied'
      : status === 429
        ? 'rate-limited'
        : (error.state ??
          (error.name === 'ZodError' || error instanceof SyntaxError
            ? 'invalid-input'
            : error.code === 'ENOENT' || status === 404
              ? 'missing-input'
              : [400, 422].includes(status)
                ? 'invalid-input'
                : 'retryable-error')),
    status,
    retryAfter: error.retryAfter ?? null,
  };
}

export function figmaApi(token, fetcher = fetch) {
  return async (method, endpoint, body) => {
    if (!token)
      throw Object.assign(new Error('Missing Figma token'), { status: 401 });
    if (
      !['GET', 'POST'].includes(method) ||
      !endpoint.startsWith('/v1/') ||
      (method === 'POST' && endpoint !== '/v1/dev_resources')
    )
      throw invalidInput('Unsupported Figma operation');
    const url = new URL(endpoint, 'https://api.figma.com');
    if (
      url.origin !== 'https://api.figma.com' ||
      url.username ||
      url.password ||
      url.hash
    )
      throw invalidInput('Untrusted Figma URL');
    if (
      method === 'GET' &&
      !/^\/v1\/files\/[A-Za-z0-9]+\/(versions|nodes|dev_resources)$/.test(
        url.pathname,
      )
    )
      throw invalidInput('Unsupported Figma operation');
    // Never retry POST automatically: the caller must reconcile by reading first.
    // GETs are idempotent; retry a transient 503 twice before failing closed.
    let response;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      response = await fetcher(url, {
        method,
        headers: {
          'X-Figma-Token': token,
          'Content-Type': 'application/json',
          'User-Agent': 'pioneer-design-consumer/1.0',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status !== 503 || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
    if (!response.ok)
      throw Object.assign(new Error('Figma request failed'), {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
      });
    return response.json();
  };
}

export async function githubApi(method, endpoint, body) {
  if (method !== 'GET' || !endpoint.startsWith('/repos/OasisViridis/Pioneer/'))
    throw invalidInput('Wrong repository');
  try {
    const output = execFileSync(
      'gh',
      [
        'api',
        '--method',
        method,
        endpoint,
        ...(body === undefined ? [] : ['--input', '-']),
      ],
      {
        input: body === undefined ? undefined : JSON.stringify(body),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 8_000_000,
      },
    );
    return output.trim() ? JSON.parse(output) : null;
  } catch (error) {
    throw Object.assign(new Error('GitHub request failed'), {
      status: Number(error.stderr?.toString().match(/HTTP (\d+)/)?.[1]),
    });
  }
}

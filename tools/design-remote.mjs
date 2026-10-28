import { execFileSync } from 'node:child_process';

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
      throw new Error('Unsupported Figma operation');
    const url = new URL(endpoint, 'https://api.figma.com');
    if (
      url.origin !== 'https://api.figma.com' ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error('Untrusted Figma URL');
    // Never retry POST automatically: the caller must reconcile by reading first.
    const response = await fetcher(url, {
      method,
      headers: { 'X-Figma-Token': token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
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
    throw new Error('Wrong repository');
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

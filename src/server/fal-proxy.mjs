// Server-side proxy for the fal realtime (WMA) client that runs on the stage page.
// The browser never sees FAL_KEY. Only the Director model's three WMA endpoints are reachable,
// only while the Director session is live, and only one provider session per attempt.
import {handleRequest} from '@fal-ai/server-proxy';

export const DIRECTOR_APP = 'minimax/h3-max/director';
const WMA_ORIGIN = 'https://wma.fal.run';
const PATHS = new Set(['/ice', '/session', '/session/heartbeat']);

// Pure policy check, kept separate so it can be unit tested.
export function proxyDecision({targetUrl, body, session}) {
  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    return {allow: false, reason: 'target'};
  }
  if (url.origin !== WMA_ORIGIN || url.search || url.hash || url.username || url.password || !PATHS.has(url.pathname)) {
    return {allow: false, reason: 'target'};
  }
  if (!session.live) return {allow: false, reason: 'session not live'};
  if (url.pathname === '/session/heartbeat') {
    return session.allowsProviderHeartbeat(body?.session_id) ? {allow: true, path: url.pathname} : {allow: false, reason: 'heartbeat'};
  }
  if (body?.app_id !== DIRECTOR_APP) return {allow: false, reason: 'model'};
  return {allow: true, path: url.pathname};
}

export async function forwardToFal({req, res, body, session, falKey, log}) {
  let parsed;
  try {
    parsed = JSON.parse(body.toString() || '{}');
  } catch {
    return sendJson(res, 400, {error: 'json'});
  }
  const decision = proxyDecision({targetUrl: req.headers['x-fal-target-url'], body: parsed, session});
  if (!decision.allow) return sendJson(res, 403, {error: decision.reason});
  if (decision.path === '/session' && !session.claimProviderSession()) return sendJson(res, 409, {error: 'one provider session per attempt'});

  await handleRequest(
    {
      id: 'inscribi-director',
      method: req.method,
      getRequestBody: async () => body.toString(),
      getHeaders: () => req.headers,
      getHeader: (name) => req.headers[name],
      sendHeader: () => {},
      respondWith: (status, data) => sendJson(res, status, data),
      sendResponse: async (response) => {
        const data = await response.json();
        if (decision.path === '/session' && response.ok) session.recordProviderSession(data.session_id);
        log('fal', {path: decision.path, status: response.status});
        sendJson(res, response.status, data);
      },
    },
    {
      isAuthenticated: async () => true,
      allowUnauthorizedRequests: false,
      resolveFalAuth: async () => `Key ${falKey}`,
      allowedEndpoints: [DIRECTOR_APP],
      allowedUrlPatterns: [],
      serviceHosts: ['wma.fal.run'],
    },
  );
}

export function sendJson(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'});
  res.end(JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value)));
}

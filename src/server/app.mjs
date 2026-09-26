// HTTP layer: pages, public API for participants, operator API and the fal proxy.
import {createServer} from 'node:http';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, extname} from 'node:path';
import QRCode from 'qrcode';
import {getAddress, isAddress, parseTransaction} from 'viem';
import {adminPage, participantPage, stagePage} from './pages.mjs';
import {forwardToFal, sendJson} from './fal-proxy.mjs';

const ASSET_DIR = fileURLToPath(new URL('../../dist/', import.meta.url));
const ASSET_TYPES = {'.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json'};
const COOKIE = 'idir_op';
const MAX_BODY = 64 * 1024;
const MAX_PROXY_BODY = 1024 * 1024;
const VOTE_GAS = '150000';
const OPERATOR_SESSION_MS = 12 * 60 * 60 * 1000;

// Participants may only use these JSON-RPC methods, and may only send transactions to StoryVote.
const RPC_METHODS = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'eth_sendRawTransaction', 'eth_sendRawTransactionSync']);
const SEND_METHODS = new Set(['eth_sendRawTransaction', 'eth_sendRawTransactionSync']);

// Provider errors after which the Director session cannot continue.
const FATAL_PROVIDER_ERRORS = new Set(['configuration_timeout', 'initialization_timeout', 'invalid_initial_image', 'invalid_initial_audio', 'invalid_initial_script', 'invalid_input', 'balance_unavailable', 'content_policy', 'generation_timeout', 'generation_failed']);

const PAGE_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function createApp({config, store, show, session, bridge, drip, chain, abi, roomId, log}) {
  // Operator logins survive a redeploy; only SHA-256 digests of the cookie values are stored.
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const operatorSessions = new Map(Object.entries(store.read('operators', {})).filter(([, expires]) => expires > Date.now()));
  const localOrigin = `http://localhost:${config.port}`;
  const allowedOrigins = new Set([config.publicOrigin, localOrigin, `http://127.0.0.1:${config.port}`]);
  const allowedHosts = new Set([...allowedOrigins].map((origin) => new URL(origin).host));
  const secureCookie = config.publicOrigin.startsWith('https:');
  let qrSvg;

  const participantAbi = abi.filter((item) => ['vote', 'refund', 'Voted'].includes(item.name));

  const isOperator = (req) => {
    const cookie = (req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
    return !!cookie && (operatorSessions.get(digest(cookie.slice(COOKIE.length + 1))) ?? 0) > Date.now();
  };

  const tokenMatches = (candidate) => {
    const a = Buffer.from(String(candidate ?? ''));
    const b = Buffer.from(config.adminToken);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const html = (res, body, csp = true) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', ...(csp ? {'content-security-policy': PAGE_CSP} : {})});
    res.end(body);
  };

  const readBody = async (req, limit) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw Object.assign(new Error('body too large'), {status: 413});
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };

  const parseJson = (buffer) => {
    try {
      return JSON.parse(buffer.toString() || '{}');
    } catch {
      throw Object.assign(new Error('invalid json'), {status: 400});
    }
  };

  const requireStage = (payload) => {
    session.requireOwner(payload.stageId);
  };

  async function relayRpc(res, payload, raw) {
    if (Array.isArray(payload) || !RPC_METHODS.has(payload.method)) return sendJson(res, 403, {error: 'method'});
    if (SEND_METHODS.has(payload.method)) {
      let tx;
      try {
        tx = parseTransaction(payload.params?.[0]);
      } catch {
        return sendJson(res, 400, {error: 'transaction'});
      }
      if (!tx.to || getAddress(tx.to) !== getAddress(config.contract) || tx.chainId !== config.chainId) return sendJson(res, 403, {error: 'transactions may only call StoryVote'});
    }
    const upstream = await chain.forward(raw.toString());
    res.writeHead(upstream.status, {'content-type': 'application/json', 'cache-control': 'no-store'});
    res.end(upstream.text);
  }

  async function operatorApi(req, res, path) {
    if (path === '/api/admin/login') {
      if (req.method !== 'POST') return sendJson(res, 405, {error: 'method'});
      const payload = parseJson(await readBody(req, MAX_BODY));
      if (!tokenMatches(payload.token)) return sendJson(res, 401, {error: 'token'});
      const id = randomBytes(32).toString('hex');
      operatorSessions.set(digest(id), Date.now() + OPERATOR_SESSION_MS);
      store.write('operators', Object.fromEntries(operatorSessions));
      res.setHeader('set-cookie', `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${OPERATOR_SESSION_MS / 1000}${secureCookie ? '; Secure' : ''}`);
      return sendJson(res, 200, {ok: true});
    }
    if (!isOperator(req)) return sendJson(res, 401, {error: 'operator login required'});

    if (req.method === 'GET' && path === '/api/admin/state') {
      return sendJson(res, 200, show.adminState({funded: drip.funded, reserved: drip.reserved, limit: config.dripLimit, amountMon: config.dripAmountMon}));
    }
    if (req.method === 'GET' && path === '/api/admin/director/next') {
      const stageId = new URL(req.url, 'http://x').searchParams.get('stageId');
      requireStage({stageId});
      return sendJson(res, 200, {direction: bridge.current()});
    }
    if (req.method !== 'POST') return sendJson(res, 405, {error: 'method'});
    const payload = parseJson(await readBody(req, MAX_BODY));

    switch (path) {
      case '/api/admin/session/start':
        if (show.stale) return sendJson(res, 409, {error: 'chain unavailable'});
        session.start(payload.stageId);
        if (!session.state.configured) bridge.reset();
        log('session started', {attempt: session.state.attempts});
        return sendJson(res, 200, session.snapshot());
      case '/api/admin/session/heartbeat':
        session.heartbeat(payload.stageId);
        return sendJson(res, 200, session.snapshot());
      case '/api/admin/session/stop':
        session.end('operator');
        void show.tick();
        return sendJson(res, 200, session.snapshot());
      case '/api/admin/director/event':
        requireStage(payload);
        handleDirectorEvent(payload.event);
        return sendJson(res, 200, {ok: true});
      case '/api/admin/round/open':
        return sendJson(res, 200, await show.openRound(payload.duration ?? config.roundSeconds));
      case '/api/admin/round/finalize':
        await show.finalizeRound();
        return sendJson(res, 200, {ok: true});
      case '/api/admin/round/cancel':
        await show.cancelRound();
        return sendJson(res, 200, {ok: true});
      case '/api/admin/direction/abandon':
        return sendJson(res, 200, {abandoned: bridge.abandon()});
      default:
        return sendJson(res, 404, {error: 'not found'});
    }
  }

  function handleDirectorEvent(event) {
    if (event?.type === 'configured') session.markConfigured();
    else if (event?.type === 'first-frame') session.markFirstFrame();
    else if (event?.type === 'provider') {
      const message = event.message;
      if (message?.type === 'configured' && message.prompt_version === 1) session.markConfigured();
      else if (message?.type === 'stream_exhausted' || (message?.type === 'error' && FATAL_PROVIDER_ERRORS.has(message.code))) {
        session.end('provider-error');
        void show.tick();
      } else bridge.message(message);
    } else if (event?.type === 'closed') {
      session.end('stage-closed');
      void show.tick();
    }
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://placeholder');
    const path = url.pathname;

    // Always 200 while the process runs: a restart would end a live Director session, so chain hiccups must not trigger one.
    if (path === '/healthz') return sendJson(res, 200, {ok: true, chain: !show.stale, director: session.state.status});
    if (!allowedHosts.has(req.headers.host)) return sendJson(res, 421, {error: 'host'});
    if (req.method !== 'GET' && req.method !== 'HEAD' && !allowedOrigins.has(req.headers.origin)) return sendJson(res, 403, {error: 'origin'});

    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('cache-control', 'no-store');

    if (req.method === 'GET') {
      if (path === '/') return html(res, participantPage());
      if (path === '/admin') return html(res, adminPage());
      // The stage runs the fal realtime client (WebRTC); it gets no CSP so the provider transport is not blocked.
      if (path === '/stage') return html(res, stagePage(), false);
      if (path === '/qr.svg') {
        qrSvg ??= await QRCode.toString(config.publicOrigin, {type: 'svg', margin: 1, color: {dark: '#0b0d12', light: '#ffffff'}});
        res.writeHead(200, {'content-type': 'image/svg+xml'});
        return res.end(qrSvg);
      }
      if (path.startsWith('/assets/')) {
        const file = resolve(ASSET_DIR, path.slice('/assets/'.length));
        if (!file.startsWith(ASSET_DIR) || !existsSync(file) || !ASSET_TYPES[extname(file)]) return sendJson(res, 404, {error: 'not found'});
        res.writeHead(200, {'content-type': ASSET_TYPES[extname(file)], 'cache-control': 'public, max-age=60'});
        return res.end(readFileSync(file));
      }
      if (path === '/api/state') return sendJson(res, 200, show.publicState());
      if (path === '/api/config') return sendJson(res, 200, {chainId: config.chainId, contract: config.contract, roomId, voteGas: VOTE_GAS, abi: participantAbi});
    }

    if (path === '/api/drip' && req.method === 'POST') {
      const payload = parseJson(await readBody(req, MAX_BODY));
      if (!isAddress(payload.address ?? '')) return sendJson(res, 400, {error: 'address'});
      try {
        return sendJson(res, 200, await drip.request(payload.address));
      } catch (error) {
        return sendJson(res, 429, {error: error.message});
      }
    }
    if (path === '/api/rpc' && req.method === 'POST') {
      const raw = await readBody(req, MAX_BODY);
      return relayRpc(res, parseJson(raw), raw);
    }
    if (path === '/api/fal/proxy' && req.method === 'POST') {
      if (!isOperator(req)) return sendJson(res, 401, {error: 'operator login required'});
      if (config.directorMode !== 'live') return sendJson(res, 409, {error: 'director is in fake mode'});
      const body = await readBody(req, MAX_PROXY_BODY);
      return forwardToFal({req, res, body, session, falKey: config.falKey, log});
    }
    if (path.startsWith('/api/admin/')) return operatorApi(req, res, path);
    return sendJson(res, 404, {error: 'not found'});
  }

  return createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      const status = error.status ?? 400;
      if (status >= 500 || !error.status) log('request failed', {path: req.url?.split('?')[0], error: error.message});
      sendJson(res, status, {error: error.message ?? 'request failed'});
    }
  });
}

// Short stable id for this deployment; scopes participant data in the browser.
export function roomIdFor(store) {
  const room = store.read('room', null) ?? {id: randomBytes(12).toString('hex')};
  store.write('room', room);
  return room.id;
}

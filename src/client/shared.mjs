// Small helpers shared by the three screens.

export const $ = (id) => document.getElementById(id);

export async function getJson(path) {
  const response = await fetch(path, {cache: 'no-store'});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? `HTTP ${response.status}`), {status: response.status});
  return data;
}

export async function postJson(path, body = {}) {
  const response = await fetch(path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? `HTTP ${response.status}`), {status: response.status});
  return data;
}

// Seconds left in a round, measured on chain time and advanced locally between polls.
export function secondsLeft(round, blockTime, fetchedAt) {
  if (!round?.open || blockTime === null) return 0;
  const chainNow = blockTime + (Date.now() - fetchedAt) / 1000;
  return Math.max(0, Math.ceil(round.deadline - chainNow));
}

export function formatSeconds(seconds) {
  return seconds > 0 ? `${seconds} sn` : '';
}

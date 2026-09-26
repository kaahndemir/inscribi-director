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

// Renders four choices with vote bars. `onPick` is optional (the stage only displays).
export function renderTally(list, round, {onPick, disabled = false, highlight = null} = {}) {
  const total = round.counts.reduce((a, b) => a + b, 0);
  const items = round.labels.map((label, index) => {
    const count = round.counts[index];
    const share = total ? Math.round((count / total) * 100) : 0;
    const element = document.createElement(onPick ? 'button' : 'li');
    element.className = 'choice';
    if (highlight === index) element.classList.add('winner');
    element.style.setProperty('--share', `${share}%`);
    const name = document.createElement('span');
    name.className = 'choice-label';
    name.textContent = label;
    const votes = document.createElement('span');
    votes.className = 'choice-count';
    votes.textContent = `${count} oy`;
    element.append(name, votes);
    if (onPick) {
      element.type = 'button';
      element.disabled = disabled;
      element.addEventListener('click', () => onPick(index));
    }
    return element;
  });
  list.replaceChildren(...items);
}

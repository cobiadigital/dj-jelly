/** Minimal hash router: #/set/abc/clip/def -> { name: 'set', parts: ['abc', 'clip', 'def'] }. */
export interface Route {
  name: string;
  parts: string[];
}

function parse(): Route {
  const [name = '', ...parts] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'sets', parts: parts.map(decodeURIComponent) };
}

export const route = $state<Route>(parse());

window.addEventListener('hashchange', () => {
  Object.assign(route, parse());
  window.scrollTo(0, 0);
});

export const href = (...parts: string[]) => `#/${parts.map(encodeURIComponent).join('/')}`;
export const go = (...parts: string[]) => (location.hash = href(...parts));

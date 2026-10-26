/** Jellyfin session. Tiny and needed synchronously to build URLs, so it lives in localStorage. */

export interface Session {
  server: string;
  serverName: string;
  userId: string;
  userName: string;
  token: string;
}

const SESSION_KEY = 'dj.session';
const DEVICE_KEY = 'dj.deviceId';

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: just won't persist */
  }
}

export const deviceId: string = (() => {
  let id = load<string>(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    save(DEVICE_KEY, id);
  }
  return id;
})();

export const auth = $state<{ session: Session | null }>({ session: load<Session>(SESSION_KEY) });

export function setSession(session: Session | null) {
  auth.session = session;
  save(SESSION_KEY, session);
}

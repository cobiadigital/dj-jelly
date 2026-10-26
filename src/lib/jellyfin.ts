import { auth, deviceId, type Session } from './session.svelte';

/** The subset of Jellyfin's BaseItemDto this app uses. */
export interface Item {
  Id: string;
  Name: string;
  Album?: string;
  AlbumArtist?: string;
  Artists?: string[];
  RunTimeTicks?: number;
}

interface ItemsResult {
  Items: Item[];
  TotalRecordCount: number;
}

const CLIENT = 'DJ Jelly';
const VERSION = '0.1.0';

function authHeader(token?: string) {
  let h = `MediaBrowser Client="${CLIENT}", Device="Browser", DeviceId="${deviceId}", Version="${VERSION}"`;
  if (token) h += `, Token="${token}"`;
  return h;
}

export function normalizeServer(input: string) {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function requireSession(): Session {
  if (!auth.session) throw new Error('Not signed in to Jellyfin');
  return auth.session;
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  return p.toString();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = requireSession();
  const res = await fetch(`${s.server}${path}`, {
    ...init,
    headers: { Authorization: authHeader(s.token), 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`Jellyfin: ${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function publicInfo(server: string): Promise<{ ServerName: string }> {
  try {
    const res = await fetch(`${server}/System/Info/Public`);
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    throw new Error(`Couldn't reach a Jellyfin server at ${server}. Check the URL, that it uses HTTPS, and that it's reachable from this device.`);
  }
}

export async function login(serverInput: string, username: string, password: string): Promise<Session> {
  const server = normalizeServer(serverInput);
  const info = await publicInfo(server);
  const res = await fetch(`${server}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  if (res.status === 401) throw new Error('Wrong username or password.');
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`);
  const data = await res.json();
  return { server, serverName: info.ServerName, userId: data.User.Id, userName: data.User.Name, token: data.AccessToken };
}

export async function logout() {
  try {
    await request('/Sessions/Logout', { method: 'POST' });
  } catch {
    /* offline or already revoked */
  }
}

export async function searchTracks(term: string, limit = 50): Promise<Item[]> {
  const s = requireSession();
  const r = await request<ItemsResult>(
    `/Items?${qs({ userId: s.userId, searchTerm: term, IncludeItemTypes: 'Audio', Recursive: true, Limit: limit, Fields: 'RunTimeTicks' })}`,
  );
  return r.Items;
}

export const ticksToSeconds = (t?: number) => (t ? t / 10_000_000 : 0);

export function artistOf(item: Item) {
  return item.Artists?.length ? item.Artists.join(', ') : (item.AlbumArtist ?? '');
}

/** Formats decodeAudioData can handle here, in Jellyfin's "container|codec" syntax. */
const decodable = (() => {
  const a = document.createElement('audio');
  const ok = (t: string) => a.canPlayType(t) !== '';
  const list: string[] = [];
  if (ok('audio/mpeg')) list.push('mp3');
  if (ok('audio/mp4; codecs="mp4a.40.2"')) list.push('m4a|aac', 'mp4|aac');
  if (ok('audio/flac')) list.push('flac');
  if (ok('audio/ogg; codecs="vorbis"')) list.push('ogg|vorbis');
  if (ok('audio/wav')) list.push('wav');
  return list.join(',');
})();

/** The whole song, in a format this browser can decode (the original file when possible, else MP3). */
export function audioUrl(trackId: string): string {
  const s = requireSession();
  return `${s.server}/Audio/${trackId}/universal?${qs({
    UserId: s.userId,
    DeviceId: deviceId,
    MaxStreamingBitrate: 999_999_999,
    Container: decodable,
    TranscodingContainer: 'mp3',
    TranscodingProtocol: 'http',
    AudioCodec: 'mp3',
    ApiKey: s.token,
  })}`;
}

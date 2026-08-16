/** Anonymous identity: a UUID in localStorage used for rate limiting and vote dedup. */
const DEVICE_KEY = 'bd-device-id';
const FAV_KEY = 'bd-favorites';
const THEME_KEY = 'bd-theme';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // localStorage can throw in private mode; fall back to a session-only id
    return 'ephemeral-' + Math.random().toString(36).slice(2);
  }
}

export function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function toggleFavorite(id: string): string[] {
  const cur = getFavorites();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function getTheme(): 'light' | 'dark' | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function setTheme(t: 'light' | 'dark') {
  localStorage.setItem(THEME_KEY, t);
  document.documentElement.classList.toggle('dark', t === 'dark');
}

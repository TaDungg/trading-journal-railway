// ── TOKEN HELPERS ──────────────────────────────────────────────
function getToken() { return localStorage.getItem('tl_token'); }
function setToken(t) { localStorage.setItem('tl_token', t); }
function clearToken() { localStorage.removeItem('tl_token'); localStorage.removeItem('tl_user'); }
function getStoredUser() { return localStorage.getItem('tl_user'); }
function setStoredUser(u) { localStorage.setItem('tl_user', u); }

// ── API HELPERS ────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}
// ── AUTH ───────────────────────────────────────────────────────
async function authLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  if (!u || !p) return showAuthError('Fill in all fields.');
  try {
    showAuthError('Signing in…', false);
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: p }),
    });
    loginSuccess(data.token, data.username);
  } catch (err) {
    showAuthError(err.message || 'Login failed.');
  }
}

async function authRegister() {
  const u = document.getElementById('reg-user').value.trim();
  const p = document.getElementById('reg-pass').value;
  if (!u || !p) return showAuthError('Fill in all fields.');
  if (p.length < 4) return showAuthError('Password must be at least 4 chars.');
  try {
    showAuthError('Creating account…', false);
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: p }),
    });
    loginSuccess(data.token, data.username);
  } catch (err) {
    showAuthError(err.message || 'Registration failed.');
  }
}

function loginSuccess(token, username) {
  authToken = token;
  currentUser = username;
  setToken(token);
  setStoredUser(username);
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('sidebar-user').textContent = username;
  init();
}

function authLogout() {
  currentUser = null;
  authToken = null;
  clearToken();
  location.reload();
}

function showAuthError(msg, isError = true) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.color = isError ? 'var(--red)' : 'var(--text3)';
}
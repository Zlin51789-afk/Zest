const LOGIN_ERROR = '???????????';
const SESSION_ERROR = '??????????????????????';

export function showLoginScreen() {
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('app').hidden = true;
}

export function showAppScreen() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('app').hidden = false;
}

export async function checkSession() {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

/** ??? Cookie ????401 ?????? */
export async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    showLoginScreen();
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
      errorEl.textContent = data.message || SESSION_ERROR;
      errorEl.hidden = false;
    }
    throw new Error(data.message || SESSION_ERROR);
  }

  return res;
}

export function initAuth(onSuccess) {
  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const userInput = document.getElementById('loginUser');
  const passInput = document.getElementById('loginPass');

  async function enterApp() {
    const ok = await checkSession();
    if (!ok) {
      showLoginScreen();
      errorEl.textContent = SESSION_ERROR;
      errorEl.hidden = false;
      return;
    }
    showAppScreen();
    onSuccess();
  }

  async function tryRestoreSession() {
    if (await checkSession()) {
      showAppScreen();
      onSuccess();
      return true;
    }
    showLoginScreen();
    return false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const username = userInput.value.trim();
    const password = passInput.value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        errorEl.textContent = data.error || LOGIN_ERROR;
        errorEl.hidden = false;
        passInput.value = '';
        passInput.focus();
        return;
      }

      await enterApp();
    } catch {
      errorEl.textContent = '??????????';
      errorEl.hidden = false;
    }
  });

  loginScreen.hidden = false;
  app.hidden = true;
  tryRestoreSession();
}

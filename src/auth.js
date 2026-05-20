/** ????????????? */
const AUTH_USER = '123123';
const AUTH_PASS = '123123';
const AUTH_STORAGE_KEY = 'chipgo_authenticated';

export function isAuthenticated() {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function initAuth(onSuccess) {
  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const userInput = document.getElementById('loginUser');
  const passInput = document.getElementById('loginPass');

  function showApp() {
    loginScreen.hidden = true;
    app.hidden = false;
    onSuccess();
  }

  function showError() {
    errorEl.textContent = '???????????';
    errorEl.hidden = false;
    passInput.value = '';
    passInput.focus();
  }

  if (isAuthenticated()) {
    showApp();
    return;
  }

  loginScreen.hidden = false;
  app.hidden = true;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const user = userInput.value.trim();
    const pass = passInput.value;

    if (user === AUTH_USER && pass === AUTH_PASS) {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, '1');
      } catch {
        /* ??????????????????? */
      }
      showApp();
    } else {
      showError();
    }
  });
}

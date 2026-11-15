'use strict';

/* ==========================================================
   Login ITSE · lógica
   ========================================================== */

const CONFIG = {
  DEMO: true,                       // ponelo en false cuando conectes el backend
  API_URL: '/api/auth/login',       // endpoint real (POST JSON)
  MAX_ATTEMPTS: 5,                  // intentos fallidos antes del bloqueo visual
  LOCK_SECONDS: 30,
};

/* Roles = los de la tabla usuario_rol. El rol lo define el servidor, no se elige en el login.
   Ajustá las rutas a tus páginas reales. */
// Si un usuario tiene varios roles, entra con el de mayor jerarquía (de izquierda a derecha)
const ROLE_PRIORITY = ['DIRECTOR', 'JEFE_BEDELIA', 'SECRETARIA_BEDELIA', 'DOCENTE', 'ALUMNO'];

const ROLES = {
  ALUMNO:             { label: 'Alumno',          redirect: '/alumno/inicio.html' },
  DOCENTE:            { label: 'Docente',         redirect: '/docente/inicio.html' },
  SECRETARIA_BEDELIA: { label: 'Secretaría',      redirect: '/bedelia/secretaria.html' },
  JEFE_BEDELIA:       { label: 'Jefe de Bedelía', redirect: '/bedelia/jefatura.html' },
  DIRECTOR:           { label: 'Director',        redirect: '/direccion/inicio.html' },
};

/* Usuarios de prueba (SOLO para DEMO). Con backend real se borra todo esto. */
const DEMO_USERS = {
  alumno:     { password: 'alumno123',     roles: ['ALUMNO'] },
  docente:    { password: 'docente123',    roles: ['DOCENTE'] },
  secretaria: { password: 'secretaria123', roles: ['SECRETARIA_BEDELIA'] },
  jefe:       { password: 'jefe123',       roles: ['JEFE_BEDELIA'] },
  director:   { password: 'director123',   roles: ['DIRECTOR', 'DOCENTE'] },
};

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Tema claro / oscuro ---------- */
const root = document.documentElement;
const themeBtn = $('#themeToggle');

function applyTheme(theme, persist) {
  root.dataset.theme = theme;
  themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  if (persist) { try { localStorage.setItem('itse-theme', theme); } catch (e) { /* modo privado */ } }
  window.dispatchEvent(new Event('themechange'));
}

themeBtn.addEventListener('click', () => {
  applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
});

applyTheme(root.dataset.theme, false);
requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('theme-ready')));

// Si nunca eligió a mano, seguimos al sistema
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let saved = null;
  try { saved = localStorage.getItem('itse-theme'); } catch (err) {}
  if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
});

/* ---------- Formulario ---------- */
const form = $('#loginForm');
const idInput = $('#identifier');
const pwInput = $('#password');
const remember = $('#remember');
const alertEl = $('#formAlert');
const submitBtn = $('#submitBtn');
const capsHint = $('#capsHint');
const card = document.querySelector('.card');

let attempts = 0;
let lockTimer = null;
let busy = false;

// Recordar usuario (solo el usuario, nunca la contraseña)
try {
  const savedUser = localStorage.getItem('itse-user');
  if (savedUser) { idInput.value = savedUser; remember.checked = true; }
} catch (e) {}

// Mostrar / ocultar contraseña
const eye = $('#togglePassword');
eye.addEventListener('click', () => {
  const show = pwInput.type === 'password';
  pwInput.type = show ? 'text' : 'password';
  eye.setAttribute('aria-pressed', String(show));
  eye.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  pwInput.focus();
});

// Aviso de Bloq Mayús
['keydown', 'keyup'].forEach((evt) =>
  pwInput.addEventListener(evt, (e) => {
    if (typeof e.getModifierState === 'function') capsHint.hidden = !e.getModifierState('CapsLock');
  })
);
pwInput.addEventListener('blur', () => { capsHint.hidden = true; });

// Limpiar error del campo al escribir
[idInput, pwInput].forEach((input) =>
  input.addEventListener('input', () => clearFieldError(input))
);

function fieldError(input, msg) {
  const box = input.closest('.field');
  box.classList.add('is-invalid');
  input.setAttribute('aria-invalid', 'true');
  const p = box.querySelector('.field__error');
  p.textContent = msg;
  p.hidden = false;
}

function clearFieldError(input) {
  const box = input.closest('.field');
  box.classList.remove('is-invalid');
  input.removeAttribute('aria-invalid');
  box.querySelector('.field__error').hidden = true;
}

function showAlert(msg, ok) {
  alertEl.textContent = msg;
  alertEl.classList.toggle('alert--ok', Boolean(ok));
  alertEl.hidden = false;
}

function hideAlert() { alertEl.hidden = true; }

function shake() {
  card.classList.remove('shake');
  void card.offsetWidth;               // reinicia la animación
  card.classList.add('shake');
}

function setBusy(state) {
  busy = state;
  submitBtn.disabled = state;
  submitBtn.dataset.state = state ? 'loading' : '';
}

/* ---------- Autenticación ---------- */
function primaryRole(roles) {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) || roles[0];
}

async function authenticate(identifier, password) {
  if (CONFIG.DEMO) {
    await sleep(800);
    const user = DEMO_USERS[identifier.toLowerCase()];
    if (!user || user.password !== password) throw new Error('Usuario o contraseña incorrectos.');
    const role = primaryRole(user.roles);
    return { role, redirect: ROLES[role].redirect };
  }

  // --- Backend real ---
  // Esperado: 200 { roles: ["ALUMNO", ...], redirect?: "/ruta" }  ·  401 credenciales  ·  403 rol no asignado  ·  429 muchos intentos
  // Recomendado: que el servidor guarde la sesión en una cookie HttpOnly + Secure + SameSite.
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, password }),
    });
  } catch (err) {
    throw new Error('No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
  }

  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos.');
  if (res.status === 403) throw new Error('Tu usuario no tiene permisos para ingresar.');
  if (res.status === 429) throw new Error('Demasiados intentos. Esperá unos minutos e intentá de nuevo.');
  if (!res.ok) throw new Error('Ocurrió un error en el servidor. Intentá de nuevo en un momento.');

  const data = await res.json().catch(() => ({}));
  const role = primaryRole(Array.isArray(data.roles) ? data.roles : []);
  const fallback = ROLES[role] ? ROLES[role].redirect : '/';
  return { role, redirect: data.redirect || fallback };
}

// Solo rutas internas, para evitar redirecciones a sitios externos
function safeRedirect(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

/* ---------- Bloqueo visual tras demasiados intentos ---------- */
function lockForm() {
  let left = CONFIG.LOCK_SECONDS;
  submitBtn.disabled = true;
  const tick = () => {
    if (left <= 0) {
      clearInterval(lockTimer);
      attempts = 0;
      submitBtn.disabled = false;
      hideAlert();
      return;
    }
    showAlert(`Demasiados intentos fallidos. Podés volver a probar en ${left} s.`);
    left -= 1;
  };
  tick();
  lockTimer = setInterval(tick, 1000);
}

/* ---------- Envío ---------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy || submitBtn.disabled) return;

  hideAlert();
  clearFieldError(idInput);
  clearFieldError(pwInput);

  const identifier = idInput.value.trim();
  const password = pwInput.value;

  let firstInvalid = null;
  if (!identifier) {
    fieldError(idInput, 'Ingresá tu usuario o email.');
    firstInvalid = idInput;
  } else if (identifier.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
    fieldError(idInput, 'Ese email no parece válido.');
    firstInvalid = idInput;
  }
  if (!password) {
    fieldError(pwInput, 'Ingresá tu contraseña.');
    firstInvalid = firstInvalid || pwInput;
  }
  if (firstInvalid) { firstInvalid.focus(); shake(); return; }

  setBusy(true);
  try {
    const result = await authenticate(identifier, password);

    try {
      if (remember.checked) localStorage.setItem('itse-user', identifier);
      else localStorage.removeItem('itse-user');
    } catch (err) {}

    setBusy(false);
    submitBtn.disabled = true;
    const dest = safeRedirect(result.redirect);

    if (CONFIG.DEMO) {
      showAlert(`Ingreso correcto (${(ROLES[result.role] || {}).label || 'sin rol'}). En producción te llevaría a ${dest}.`, true);
      setTimeout(() => { submitBtn.disabled = false; }, 2500);
    } else {
      showAlert('Ingreso correcto. Te estamos redirigiendo…', true);
      window.location.assign(dest);
    }
  } catch (err) {
    setBusy(false);
    attempts += 1;
    shake();
    if (attempts >= CONFIG.MAX_ATTEMPTS) { lockForm(); return; }
    showAlert(err.message);
    pwInput.value = '';
    pwInput.focus();
  }
});

// Pista de usuarios de prueba (se borra sola al pasar DEMO a false)
if (CONFIG.DEMO) {
  const hint = $('#demoHint');
  hint.textContent = 'Modo demo · usuario: alumno, docente, secretaria, jefe o director · clave: usuario + 123';
  hint.hidden = false;
}

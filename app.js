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

/* Roles = los de la tabla usuario_rol. Ajustá las rutas a tus páginas reales. */
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
async function authenticate(identifier, password, role) {
  if (CONFIG.DEMO) {
    await sleep(800);
    const user = DEMO_USERS[identifier.toLowerCase()];
    if (!user || user.password !== password) throw new Error('Usuario o contraseña incorrectos.');
    if (!user.roles.includes(role)) {
      throw new Error(`Tu usuario no tiene el rol ${ROLES[role].label}. Elegí otro rol.`);
    }
    return { role, redirect: ROLES[role].redirect };
  }

  // --- Backend real ---
  // Esperado: 200 { redirect?: "/ruta" }  ·  401 credenciales  ·  403 rol no asignado  ·  429 muchos intentos
  // Recomendado: que el servidor guarde la sesión en una cookie HttpOnly + Secure + SameSite.
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, password, role }),
    });
  } catch (err) {
    throw new Error('No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
  }

  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos.');
  if (res.status === 403) throw new Error(`Tu usuario no tiene el rol ${ROLES[role].label}.`);
  if (res.status === 429) throw new Error('Demasiados intentos. Esperá unos minutos e intentá de nuevo.');
  if (!res.ok) throw new Error('Ocurrió un error en el servidor. Intentá de nuevo en un momento.');

  const data = await res.json().catch(() => ({}));
  return { role, redirect: data.redirect || ROLES[role].redirect };
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
  const role = form.elements.role.value;

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
    const result = await authenticate(identifier, password, role);

    try {
      if (remember.checked) localStorage.setItem('itse-user', identifier);
      else localStorage.removeItem('itse-user');
    } catch (err) {}

    setBusy(false);
    submitBtn.disabled = true;
    const dest = safeRedirect(result.redirect);

    if (CONFIG.DEMO) {
      showAlert(`Ingreso correcto como ${ROLES[result.role].label}. En producción te llevaría a ${dest}.`, true);
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

/* ==========================================================
   Panel de puntos (matriz) con el logo del instituto
   ========================================================== */
(function matrix() {
  const holder = $('#visual');
  const canvas = $('#matrix');
  if (!holder || !canvas) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CELL = 9;

  let w = 0, h = 0, cols = 0, rows = 0, dpr = 1;
  let mask = new Float32Array(0);
  let noise = new Float32Array(0);
  let rgb = '15,19,32';
  const mouse = { x: -999, y: -999 };
  let last = 0;
  let running = false;

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // Gradiente del logo (celeste → violeta → carmesí) para los puntos del logo
  let ramp = [];
  function buildRamp() {
    const dark = root.dataset.theme === 'dark';
    const stops = dark ? [[26, 167, 238], [139, 116, 196], [240, 51, 106]]
                       : [[2, 136, 209], [99, 79, 142], [194, 1, 54]];
    ramp = [];
    for (let k = 0; k <= 32; k++) {
      const t = k / 32 * 2, i = Math.min(1, Math.floor(t)), f = t - i;
      ramp.push(stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f)).join(','));
    }
  }

  function readColor() {
    rgb = getComputedStyle(root).getPropertyValue('--dot-rgb').trim() || rgb;
    buildRamp();
  }

  // Dibuja ">> ITSE" a baja resolución (1 px = 1 celda) y lo usa como máscara
  function buildMask() {
    const off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    const o = off.getContext('2d', { willReadFrequently: true });

    const H = rows * 0.34;
    const W = H * 0.55;
    const cx = cols * 0.52;
    const cy = rows * 0.4;
    const x0 = cx - W * 0.85 / 2 - W / 2;

    o.strokeStyle = '#000';
    o.lineWidth = H * 0.2;
    o.lineJoin = 'miter';
    o.lineCap = 'butt';
    for (let k = 0; k < 2; k++) {
      const x = x0 + k * W * 0.85 + W * 0.2;
      o.beginPath();
      o.moveTo(x, cy - H / 2);
      o.lineTo(x + W, cy);
      o.lineTo(x, cy + H / 2);
      o.stroke();
    }

    o.fillStyle = '#000';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.font = `800 ${H * 0.46}px Manrope, "Arial Black", Arial, sans-serif`;
    o.fillText('ITSE', cx, cy + H * 0.98);

    const data = o.getImageData(0, 0, cols, rows).data;
    mask = new Float32Array(cols * rows);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] / 255;
  }

  function resize() {
    const rect = holder.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(w / CELL);
    rows = Math.ceil(h / CELL);
    noise = new Float32Array(cols * rows);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random();
    buildMask();
    render(performance.now());
  }

  function render(now) {
    const t = now / 1000;
    ctx.clearRect(0, 0, w, h);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;

        // 0 en el borde izquierdo (junto al formulario) → 1 hacia la derecha: el logo se "disuelve"
        const reveal = smooth(0.0, 0.42, c / cols);
        const n = noise[i];
        const lit = mask[i] > 0.4 && n < reveal * 1.25;

        const dx = x - mouse.x, dy = y - mouse.y;
        const near = Math.max(0, 1 - Math.hypot(dx, dy) / 95);

        const shimmer = reduceMotion ? 0 : Math.sin(t * 1.4 + n * 40) * 0.5 + 0.5;

        let alpha, size;
        if (lit) {
          alpha = 0.7 + shimmer * 0.25;
          size = 5.2;
        } else {
          alpha = (0.07 + shimmer * 0.05) * (0.4 + reveal * 0.6);
          size = 2;
        }
        if (near > 0) {
          alpha = Math.min(1, alpha + near * 0.55);
          size += near * 3;
        }
        if (alpha < 0.02) continue;

        const tone = (lit || near > 0.15)
          ? ramp[Math.round(Math.min(1, Math.max(0, (c / cols - 0.28) / 0.5)) * 32)]
          : rgb;
        ctx.fillStyle = `rgba(${tone},${alpha.toFixed(3)})`;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
  }

  function loop(now) {
    if (!running) return;
    if (now - last > 40) { last = now; render(now); }   // ~25 fps alcanza
    requestAnimationFrame(loop);
  }

  function start() {
    if (reduceMotion || running) return;
    running = true;
    requestAnimationFrame(loop);
  }

  holder.addEventListener('pointermove', (e) => {
    const rect = holder.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    if (reduceMotion) render(performance.now());
  });
  holder.addEventListener('pointerleave', () => {
    mouse.x = mouse.y = -999;
    if (reduceMotion) render(performance.now());
  });

  window.addEventListener('themechange', () => { readColor(); render(performance.now()); });

  new ResizeObserver(resize).observe(holder);

  readColor();
  resize();
  start();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { buildMask(); render(performance.now()); });
  }
})();

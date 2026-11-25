/* ===== ROSHNI ASSOCIATION - SHARED JS ===== */

// ── Font Size Accessibility ──────────────────────────────────────────────────
function adjustFontSize(dir) {
  const body = document.body;
  let s = parseFloat(window.getComputedStyle(body).fontSize);
  if (dir > 0 && s < 22) body.style.fontSize = (s + 1) + 'px';
  if (dir < 0 && s > 12) body.style.fontSize = (s - 1) + 'px';
  localStorage.setItem('roshni-fontsize', body.style.fontSize);
}
(function applySavedFont() {
  const saved = localStorage.getItem('roshni-fontsize');
  if (saved) document.body.style.fontSize = saved;
})();

// ── Mobile Nav Toggle ────────────────────────────────────────────────────────
function initMobileNav() {
  const btn = document.getElementById('mobileMenuBtn');
  const nav = document.getElementById('mobileNav');
  if (!btn || !nav) return;
  // nav.js already binds the click toggle; only bind outside-click close here
  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── Toast notification ───────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.style.background = type === 'error'
    ? 'linear-gradient(135deg, #DC2626, #EF4444)'
    : 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 50%, #F97316 100%)';
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._tid);
  toast._tid = setTimeout(() => toast.classList.remove('show'), 4000);
}

// ── Dynamic API base resolver ────────────────────────────────────────────────
const API_BASE = (window.location.protocol.startsWith('http') && window.location.port === '3001')
  ? '/api'
  : 'http://localhost:3001/api';

async function apiPost(endpoint, data) {
  try {
    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    return { ok: res.ok, data: json };
  } catch (err) {
    console.warn('Backend API connection note (using fallback):', err.message);
    // Graceful offline fallback demo saving to localStorage
    const localStoreKey = 'roshni_offline_' + endpoint.replace(/\//g, '_');
    const existing = JSON.parse(localStorage.getItem(localStoreKey) || '[]');
    existing.push({ ...data, savedAt: new Date().toISOString() });
    localStorage.setItem(localStoreKey, JSON.stringify(existing));
    return { ok: true, data: { demo: true, offlineSaved: true } };
  }
}

async function apiGet(endpoint) {
  try {
    const res = await fetch(API_BASE + endpoint);
    const json = await res.json();
    return { ok: res.ok, data: json };
  } catch (err) {
    console.warn('API offline – using demo data fallback:', err.message);
    return { ok: false, data: null };
  }
}

// ── Generic contact / inquiry form handler ───────────────────────────────────
function initContactForm(formId, endpoint, successMsg) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const origText = btn ? btn.innerHTML : 'Submit';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Processing...';
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await apiPost(endpoint, data);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
    if (res.ok) {
      showToast(successMsg || '✅ Submitted successfully! We will get back to you shortly.');
      form.reset();
    } else {
      showToast(res.data?.error || '❌ Submission failed. Please try again.', 'error');
    }
  });
}

// ── Scroll-activated fade-in ─────────────────────────────────────────────────
function initScrollReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('fade-up');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => { el.style.opacity = '0'; obs.observe(el); });
}

// ── Counter animation ────────────────────────────────────────────────────────
function initCounters() {
  const counters = document.querySelectorAll('[data-counter]');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.counter.replace(/[^0-9.]/g, ''));
      const suffix = el.dataset.counter.replace(/[0-9.]/g, '');
      let start = 0;
      const dur = 1500;
      const step = target / (dur / 16);
      const tick = () => {
        start = Math.min(start + step, target);
        el.textContent = (Number.isInteger(target) ? Math.round(start) : start.toFixed(1)) + suffix;
        if (start < target) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(c => obs.observe(c));
}

// ── Init all on DOM ready ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initScrollReveal();
  initCounters();
});


// ── Dynamic Site Photos (Monogram & Project/Workshop Photos from MongoDB) ───
(function applyDynamicSitePhotos() {
  const filenameToSlot = {
    'roshni_logo.jpg': 'monogram',
    'village_community.jpg': 'village',
    'green_earth_school.jpg': 'school',
    'organic_bakery.jpg': 'bakery',
    'organic_farm.jpg': 'farm',
    'crafts_workshop.jpg': 'crafts'
  };
  function applyMap(sitePhotos) {
    if (!sitePhotos) return;
    document.querySelectorAll('img').forEach(img => {
      const dataSlot = img.getAttribute('data-site-photo');
      if (dataSlot && sitePhotos[dataSlot]) {
        if (img.src !== sitePhotos[dataSlot]) img.src = sitePhotos[dataSlot];
        return;
      }
      const src = img.getAttribute('src') || '';
      for (const [fname, slot] of Object.entries(filenameToSlot)) {
        if (src.endsWith(fname) && sitePhotos[slot]) {
          if (img.src !== sitePhotos[slot]) img.src = sitePhotos[slot];
          break;
        }
      }
    });
  }
  async function loadAndApply() {
    try {
      const cached = localStorage.getItem('roshni_site_photos');
      if (cached) applyMap(JSON.parse(cached));
    } catch (e) {}
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (!res.ok) return;
      const settings = await res.json();
      if (!settings || !settings.sitePhotos) return;
      try { localStorage.setItem('roshni_site_photos', JSON.stringify(settings.sitePhotos)); } catch (e) {}
      applyMap(settings.sitePhotos);
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAndApply);
  } else {
    loadAndApply();
  }
})();

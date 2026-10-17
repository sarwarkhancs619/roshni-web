/**
 * nav.js – injects the shared top-bar + header + mobile-nav into every page.
 * Resilient version: works on Vercel, local, and any hosting environment.
 */
(function () {
  const pages = [
    { key: 'home',      label: 'Home',        href: 'index.html' },
    { key: 'about',     label: 'About Us',     href: 'about.html' },
    { key: 'projects',  label: 'Projects',     href: 'projects.html' },
    { key: 'volunteer', label: 'Volunteer',    href: 'volunteer.html' },
    { key: 'shop',      label: 'Shop',         href: 'shop.html' },
    { key: 'news',      label: 'News & Media', href: 'news.html' },
    { key: 'contact',   label: 'Contact',      href: 'contact.html' },
  ];

  const active = window.ACTIVE_PAGE || '';

  const navLinks = pages.map(p => {
    const cls = p.key === active ? ' class="active"' : '';
    return `<a href="${p.href}"${cls}>${p.label}</a>`;
  }).join('\n            ');

  const mobileLinks = pages.map(p => {
    const cls = p.key === active ? ' class="active"' : '';
    return `<a href="${p.href}"${cls}>${p.label}</a>`;
  }).join('\n            ');

  // Use root-relative paths so it works on all hosts (Vercel, local, etc.)
  const logoSrc = '/assets/images/roshni_logo.jpg';

  const html = `
  <!-- Top Bar -->
  <div class="top-bar">
    <div class="top-bar-inner">
      <span>📍 Karbath Soling, Bedian Road, Lahore, Pakistan</span>
      <div style="display:flex;align-items:center;gap:1.25rem;">
        <span>📞 +92 42 37167791</span>
        <span>✉️ pr@roshni.org.pk</span>
        <div class="font-ctrl" style="border-left:1px solid rgba(255,255,255,0.2);padding-left:0.75rem;">
          <button onclick="adjustFontSize(1)" title="Increase text size" aria-label="Increase text size">A+</button>
          <button onclick="adjustFontSize(-1)" title="Decrease text size" aria-label="Decrease text size">A-</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Site Header with Monogram -->
  <header class="site-header">
    <div class="header-inner">
      <a href="/index.html" class="logo-link">
        <img src="${logoSrc}" alt="Roshni Association Monogram"
          style="width:2.85rem;height:2.85rem;border-radius:50%;object-fit:cover;box-shadow:0 3px 10px rgba(30,64,175,0.25);border:2px solid #fff;background:#fff;"
          onerror="this.style.display='none'">
        <div>
          <div class="logo-text-main">Roshni Association</div>
          <div class="logo-text-sub">Welfare of Special Persons</div>
        </div>
      </a>
      <nav class="site-nav">
        ${navLinks}
      </nav>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <a href="/contact.html#donate" class="nav-cta">💛 Support Us</a>
        <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Toggle menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
    <!-- Mobile nav -->
    <nav class="mobile-nav" id="mobileNav">
      ${mobileLinks}
    </nav>
  </header>
  `;

  function inject() {
    const placeholder = document.getElementById('site-header-placeholder');
    if (placeholder) {
      placeholder.outerHTML = html;
    } else {
      document.body.insertAdjacentHTML('afterbegin', html);
    }

    // Mobile menu toggle
    const btn = document.getElementById('mobileMenuBtn');
    const nav = document.getElementById('mobileNav');
    if (btn && nav) {
      btn.addEventListener('click', function () {
        const open = nav.classList.toggle('open');
        btn.setAttribute('aria-expanded', open);
      });
    }
  }

  // Run as soon as DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();

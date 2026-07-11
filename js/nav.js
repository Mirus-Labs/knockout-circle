/* Shared responsive navigation — available immediately, before page data loads. */
(() => {
  const nav = document.getElementById('siteNav');
  const toggle = nav?.querySelector('.nav-menu-toggle');
  const drawer = document.getElementById('mobileNav');
  if (!nav || !toggle || !drawer) return;

  const setOpen = (open) => {
    nav.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    drawer.setAttribute('aria-hidden', String(!open));
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  drawer.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setOpen(false);
  });
  addEventListener('resize', () => {
    if (innerWidth > 900) setOpen(false);
  }, { passive: true });
})();

/* Knockout Circle — motion & atmosphere (GSAP + Three.js) */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const loader = document.getElementById('loader');

  /* ---------- graceful fallback if CDNs fail ---------- */
  if (!window.gsap) {
    if (loader) loader.remove();
    document.querySelectorAll('.will-reveal').forEach(e => { e.style.opacity = 1; });
    document.querySelectorAll('[data-count]').forEach(e => { e.textContent = e.dataset.count; });
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  /* ============================================================
     THREE.JS — orbiting gold dust behind everything
     ============================================================ */
  const THEME_COLORS = { dark: 0xE7B53C, light: 0x8a5e10 };
  let three = null;

  function initThree() {
    if (!window.THREE) return;
    const canvas = document.getElementById('bg3d');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, .1, 20);
    camera.position.z = 3.4;

    const group = new THREE.Group();
    scene.add(group);

    const mats = [];
    const makeRing = (radius, count, spread, size, opacity) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius + (Math.random() - .5) * spread;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = Math.sin(a) * r;
        pos[i * 3 + 2] = (Math.random() - .5) * spread * 2.2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: THEME_COLORS.dark, size, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      mat.userData.baseOpacity = opacity;
      mats.push(mat);
      return new THREE.Points(geo, mat);
    };

    const r1 = makeRing(1.05, 700, .06, .012, .6);
    const r2 = makeRing(1.42, 900, .1, .01, .42);
    const r3 = makeRing(1.85, 1100, .2, .009, .3);
    const dust = makeRing(1.2, 500, 2.4, .008, .22);
    group.add(r1, r2, r3, dust);
    group.rotation.x = .62;

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    if (fine && !reduced) {
      window.addEventListener('pointermove', (ev) => {
        mouse.tx = (ev.clientX / window.innerWidth - .5);
        mouse.ty = (ev.clientY / window.innerHeight - .5);
      }, { passive: true });
    }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // light mode: additive gold washes out on paper — switch to normal blending, deeper gold
    const applyMode = (mode) => {
      const light = mode === 'light';
      mats.forEach(m => {
        m.color.setHex(THEME_COLORS[light ? 'light' : 'dark']);
        m.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
        m.opacity = m.userData.baseOpacity * (light ? .8 : 1);
        m.needsUpdate = true;
      });
    };
    applyMode(document.documentElement.dataset.theme);
    window.addEventListener('kc:theme', (ev) => applyMode(ev.detail));

    let t = 0;
    const loop = () => {
      t += .0016;
      r1.rotation.z = t * 1.4;
      r2.rotation.z = -t;
      r3.rotation.z = t * .6;
      dust.rotation.z = -t * .35;
      mouse.x += (mouse.tx - mouse.x) * .04;
      mouse.y += (mouse.ty - mouse.y) * .04;
      group.rotation.y = mouse.x * .35;
      group.rotation.x = .62 + mouse.y * .22;
      renderer.render(scene, camera);
      if (!reduced) requestAnimationFrame(loop);
    };
    loop(); // reduced-motion renders a single static frame
    three = { renderer };
  }
  initThree();

  /* ============================================================
     CUSTOM CURSOR + MAGNETIC BUTTONS
     ============================================================ */
  if (fine && !reduced) {
    const dot = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    // keep both centered on the pointer — gsap x/y replaces the CSS translate(-50%,-50%)
    gsap.set([dot, ring], { xPercent: -50, yPercent: -50, x: 0, y: 0 });
    const dx = gsap.quickTo(dot, 'x', { duration: .08, ease: 'power2.out' });
    const dy = gsap.quickTo(dot, 'y', { duration: .08, ease: 'power2.out' });
    const rx = gsap.quickTo(ring, 'x', { duration: .35, ease: 'power3.out' });
    const ry = gsap.quickTo(ring, 'y', { duration: .35, ease: 'power3.out' });
    window.addEventListener('pointermove', (ev) => {
      dx(ev.clientX); dy(ev.clientY); rx(ev.clientX); ry(ev.clientY);
    }, { passive: true });
    document.addEventListener('pointerover', (ev) => {
      if (ev.target.closest('[data-cursor], a, button')) document.body.classList.add('cursor-hover');
    });
    document.addEventListener('pointerout', (ev) => {
      if (ev.target.closest('[data-cursor], a, button')) document.body.classList.remove('cursor-hover');
    });

    document.querySelectorAll('[data-magnetic]').forEach(btn => {
      const xTo = gsap.quickTo(btn, 'x', { duration: .4, ease: 'power3.out' });
      const yTo = gsap.quickTo(btn, 'y', { duration: .4, ease: 'power3.out' });
      btn.addEventListener('pointermove', (ev) => {
        const b = btn.getBoundingClientRect();
        xTo((ev.clientX - (b.left + b.width / 2)) * .3);
        yTo((ev.clientY - (b.top + b.height / 2)) * .3);
      });
      btn.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ============================================================
     LOADER → HERO INTRO
     ============================================================ */
  const counter = { v: 0 };
  const countEl = document.getElementById('loaderCount');
  const heroTl = gsap.timeline({ paused: true });

  heroTl
    .from('.hero-title .line > span', {
      yPercent: 112, duration: 1.1, ease: 'power4.out', stagger: .12,
    })
    .to('[data-reveal]', {
      opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .1,
      startAt: { y: 24 },
    }, '-=.7')
    .from('.ticker', { yPercent: 100, opacity: 0, duration: .7, ease: 'power3.out' }, '-=.6')
    .from('.site-nav', { y: -20, opacity: 0, duration: .6, ease: 'power2.out' }, '-=.5')
    .add(() => {
      document.querySelectorAll('[data-count]').forEach(elm => {
        const target = +elm.dataset.count;
        const o = { v: 0 };
        gsap.to(o, {
          v: target, duration: 1.4, ease: 'power2.out',
          onUpdate: () => { elm.textContent = Math.round(o.v); },
        });
      });
    }, '-=.9');

  if (reduced) {
    loader.remove();
    gsap.set(['.hero-title .line > span', '[data-reveal]', '.ticker', '.site-nav'], { clearProps: 'all', opacity: 1 });
    document.querySelectorAll('[data-count]').forEach(e => { e.textContent = e.dataset.count; });
  } else {
    const ring = loader.querySelector('.loader-ring circle');
    const tl = gsap.timeline();
    tl.to(ring, { strokeDashoffset: 0, duration: 1.15, ease: 'power2.inOut' }, 0)
      .to(counter, {
        v: 100, duration: 1.15, ease: 'power2.inOut',
        onUpdate: () => { countEl.textContent = String(Math.round(counter.v)).padStart(2, '0'); },
      }, 0)
      .to(loader, {
        yPercent: -100, duration: .8, ease: 'power4.inOut', delay: .15,
        onComplete: () => { loader.remove(); ScrollTrigger.refresh(); },
      })
      .add(() => heroTl.play(), '-=.45');

    // safety: if rAF is throttled (background tab), never trap the user behind the loader
    setTimeout(() => {
      const l = document.getElementById('loader');
      if (l) { tl.kill(); l.remove(); heroTl.play().progress(1); ScrollTrigger.refresh(); }
    }, 5000);
  }

  window.addEventListener('load', () => ScrollTrigger.refresh());

  /* ============================================================
     SCROLL CHOREOGRAPHY
     ============================================================ */
  if (!reduced) {
    // hero parallax drift
    gsap.to('.hero-title', {
      yPercent: -14, opacity: .35, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    // section heads
    document.querySelectorAll('.block-head').forEach(head => {
      gsap.from(head.children, {
        opacity: 0, y: 34, duration: .9, ease: 'power3.out', stagger: .12,
        scrollTrigger: { trigger: head, start: 'top 82%' },
      });
    });

    // group-stage cards bloom in as the grid scrolls into view
    if (document.querySelector('.group-card')) {
      ScrollTrigger.batch('.group-card', {
        start: 'top 92%',
        onEnter: (batch) => gsap.from(batch, {
          opacity: 0, y: 26, duration: .55, ease: 'power3.out', stagger: .06, overwrite: true,
        }),
        once: true,
      });
    }

    // the circle: wires draw in, badges & chips bloom
    // (skipped when the circle is hidden — mobile shows the round-by-round list instead)
    const circleVisible = () => {
      const stage = document.querySelector('.bracket-stage');
      return stage && getComputedStyle(stage).display !== 'none';
    };
    if (circleVisible()) {
    // .next wires keep their CSS dash pattern, so they fade in instead of dash-drawing
    const wires = document.querySelectorAll('#wires .wire:not(.next)');
    const nextWires = document.querySelectorAll('#wires .wire.next');
    wires.forEach(w => {
      const len = w.getTotalLength();
      w.style.strokeDasharray = len;
      w.style.strokeDashoffset = len;
    });
    const circleTl = gsap.timeline({
      scrollTrigger: { trigger: '#bracket', start: 'top 74%' },
    });
    circleTl
      .to(wires, {
        strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut', stagger: .012,
      })
      .fromTo(nextWires, { opacity: 0 }, { opacity: 1, duration: .9, stagger: .04 }, '-=1.0')
      .fromTo('#wires .junction', { opacity: 0 }, { opacity: 1, duration: .5, stagger: .015 }, '-=1.1')
      .fromTo('.badge',
        { opacity: 0, scale: .2, xPercent: -50, yPercent: -50 },
        {
          opacity: 1, scale: 1, xPercent: -50, yPercent: -50,
          duration: .55, ease: 'back.out(2.4)', stagger: { each: .022, from: 'start' },
          clearProps: 'transform,opacity',
        }, '-=1.4')
      .fromTo('.chip',
        { opacity: 0, scale: .4, xPercent: -50, yPercent: -50 },
        {
          opacity: 1, scale: 1, xPercent: -50, yPercent: -50,
          duration: .45, ease: 'back.out(2)', stagger: .02,
          clearProps: 'transform,opacity',
        }, '-=.9')
      .fromTo('.final-node',
        { opacity: 0, scale: 0, xPercent: -50, yPercent: -50 },
        {
          opacity: 1, scale: 1, xPercent: -50, yPercent: -50,
          duration: .9, ease: 'elastic.out(1, .45)',
          clearProps: 'transform,opacity',
        }, '-=.35');
    }

    // pulse panels
    gsap.from('.panel-stats', {
      opacity: 0, y: 44, duration: .9, ease: 'power3.out',
      scrollTrigger: { trigger: '.pulse-grid', start: 'top 80%' },
    });
    gsap.from('.panel-news', {
      opacity: 0, y: 44, duration: .9, delay: .12, ease: 'power3.out',
      scrollTrigger: { trigger: '.pulse-grid', start: 'top 80%' },
    });
    gsap.from('footer > *', {
      opacity: 0, y: 20, duration: .7, ease: 'power2.out', stagger: .1,
      scrollTrigger: { trigger: 'footer', start: 'top 92%' },
    });
  } else {
    // reduced motion: everything visible, wires fully drawn
    gsap.set(['.badge', '.chip', '.final-node'], { opacity: 1 });
  }
})();

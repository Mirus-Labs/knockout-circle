/* Knockout Immersive — dynamic match story derived from the Claude Design export. */
(() => {
  const KC = window.KC;
  const D = window.KC_DATA;
  const root = document.getElementById('matchPage');
  if (!KC || !D || !root) return;

  const qs = new URLSearchParams(location.search);
  const key = qs.get('round') || 'qf';
  const idx = Number.parseInt(qs.get('match') || '0', 10);
  const ri = KC.roundIdx(key);
  const round = D.ROUNDS[ri];
  if (!round || !Number.isInteger(idx) || idx < 0 || idx >= round.count) {
    root.innerHTML = `<section class="im-error"><strong>404</strong><h1>That match left the circle.</h1><a href="index.html#circle">Back to the bracket</a></section>`;
    return;
  }

  const T = D.TEAMS;
  const id = `${key}-${idx}`;
  const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
  const ta = a ? T[a] : null, tb = b ? T[b] : null;
  const st = KC.statusOf(key, idx), sc = KC.scoreOf(key, idx);
  const result = (D.RESULTS || {})[id], live = (D.LIVE || {})[id];
  const source = st === 'live' ? live : result;
  const meta = (D.META || {})[id] || {};
  const name = (t) => t ? t.n : 'To be decided';
  const flag = (t) => t ? t.f : '❔';
  const scoreA = sc.a == null ? '–' : sc.a, scoreB = sc.b == null ? '–' : sc.b;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const date = meta.date ? (() => { const [,m,d] = meta.date.split('-'); return `${MONTHS[+m-1]} ${+d}`; })() : '';
  const when = [meta.ground, date, meta.time].filter(Boolean).join(' · ') || 'Venue and kick-off to be confirmed';
  const status = st === 'live' ? `LIVE ${sc.min}’` : st === 'finished' ? 'FULL TIME' : 'UPCOMING';
  const maxMinute = st === 'live' ? sc.min : st === 'finished' ? 90 : 0;
  const matchup = [name(ta), name(tb)].sort().join('|');

  const HIGHLIGHTS = D.HIGHLIGHTS || {};
  const highlight = HIGHLIGHTS[matchup];
  const embedId = highlight && (highlight.embedYoutubeId || highlight.youtubeId);
  const embedTitle = highlight && (highlight.embedTitle || highlight.title);
  const stadium = (D.STADIUM_IMAGES || {})[meta.ground];

  const events = source ? [
    ...(source.goalsA || []).map(g => ({...g, code:a, icon:'⚽'})),
    ...(source.goalsB || []).map(g => ({...g, code:b, icon:'⚽'})),
  ].sort((x,y)=>(parseInt(x.minute,10)||0)-(parseInt(y.minute,10)||0)) : [];
  const eventRows = events.length ? events.map(e => `<div class="im-event" data-minute="${parseInt(e.minute,10)||0}">
    <span>${e.minute}’</span><i>${e.icon}</i><strong>${e.name}${e.penalty?' (pen)':''}${e.owngoal?' (og)':''}</strong><b>${e.code && T[e.code] ? T[e.code].f : '⚽'}</b>
  </div>`).join('') : `<p class="im-empty">${st === 'upcoming' ? 'The timeline begins at kick-off.' : 'No goals recorded in this match.'}</p>`;

  const stats = (() => {
    if (!D.REAL) {
      const s = KC.matchStats(key, idx);
      return [
        {label:'POSSESSION %', va:s.possA, vb:s.possB, pct:s.possA},
        {label:'SHOTS', va:s.shotsA, vb:s.shotsB, pct:s.shotsA/(s.shotsA+s.shotsB)*100},
        {label:'EXPECTED GOALS', va:s.xgA, vb:s.xgB, pct:+s.xgA/(+s.xgA + +s.xgB)*100},
      ];
    }
    const wins = (t) => t ? t.fm.filter(x=>x==='W').length : 0;
    return [
      {label:'GOALS', va:sc.a == null ? 0 : sc.a, vb:sc.b == null ? 0 : sc.b, pct:(+sc.a||0)/((+sc.a||0)+(+sc.b||0)||1)*100},
      {label:'FIFA RANK', va:ta ? ta.rk : 0, vb:tb ? tb.rk : 0, pct:ta && tb ? tb.rk/(ta.rk+tb.rk)*100 : 50},
      {label:'WINS · LAST FIVE', va:wins(ta), vb:wins(tb), pct:wins(ta)/(wins(ta)+wins(tb)||1)*100},
    ];
  })();
  const statRows = stats.map(s => `<div class="im-stat">
    <div><strong data-target="${s.va}">0</strong><span>${s.label}</span><strong data-target="${s.vb}">0</strong></div>
    <div class="im-stat-track"><i data-width="${Math.max(0,Math.min(100,s.pct))}"></i></div>
  </div>`).join('');

  const players = [
    ta && {num:'10', tag:`PLAYER TO WATCH · ${a}`, n:ta.st, meta:`${ta.f} ${ta.n}`, stat:`The creative reference point · coached by ${ta.co}`, hue:42},
    tb && {num:'10', tag:`PLAYER TO WATCH · ${b}`, n:tb.st, meta:`${tb.f} ${tb.n}`, stat:`The player this tie can turn on · coached by ${tb.co}`, hue:210},
  ].filter(Boolean);
  const playerLayers = players.map((p,i)=>{const photo=(D.PLAYER_IMAGES||{})[p.n];return `<div class="im-player-layer" data-player-layer="${i}" data-player-name="${p.n}" style="--h:${p.hue}"><span>${p.num}</span>${photo&&photo.url?`<a href="${photo.fifaUrl||photo.page}" target="_blank" rel="noopener">${photo.fifaUrl?'View on FIFA ↗':'Photo source ↗'}</a>`:''}</div>`;}).join('');
  const playerTexts = players.map((p,i)=>{const media=(D.PLAYER_IMAGES||{})[p.n];return `<div class="im-player-copy" data-player-copy="${i}"><span>${p.tag}</span><h2>${p.n}</h2><strong>${p.meta}</strong><p>${p.stat}</p>${media&&media.youtubeUrl?`<a class="im-player-video" href="${media.youtubeUrl}" target="_blank" rel="noopener">Watch official FIFA player video ↗</a>`:''}</div>`;}).join('');
  const playerDots = players.map((p,i)=>`<button data-player-dot="${i}" aria-label="Show ${p.n}"></button>`).join('');

  const video = highlight && embedId ? `<section class="im-video-section" aria-labelledby="highlight-title">
    <div class="im-video-head"><span>OFFICIAL MATCH VIDEO</span><h2 id="highlight-title">Watch the highlights</h2></div>
    <div class="im-video">
      <div class="im-video-frame"><iframe src="https://www.youtube.com/embed/${embedId}?rel=0" title="${embedTitle}" loading="lazy" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      <div class="im-video-caption"><div><span>${highlight.embedChannel ? `MATCH VIDEO · ${highlight.embedChannel.toUpperCase()}` : 'OFFICIAL FIFA MATCH HIGHLIGHTS'}</span><strong>${embedTitle}</strong></div><div class="im-video-sources">${highlight.embedYoutubeUrl ? `<a href="${highlight.embedYoutubeUrl}" target="_blank" rel="noopener">Watch video on YouTube ↗</a>` : ''}<a href="${highlight.youtubeUrl}" target="_blank" rel="noopener">Watch FIFA upload ↗</a></div></div>
    </div>
  </section>` : '';

  const next = key === 'final' ? null : KC.nextInfo(key, idx);
  const stake = key === 'final' ? 'The World Cup' : (next && next.oppLabel ? next.oppLabel : `A place in the ${D.ROUNDS[ri+1].name}`);
  document.title = `${name(ta)} vs ${name(tb)} — Knockout Immersive`;
  root.innerHTML = `
    <section class="im-hero">
      <div class="im-hero-top"><a href="index.html#circle">FIFA WORLD CUP 2026 · ${round.name.toUpperCase()} · TIE ${idx+1}</a><span class="im-live ${st}"><i></i>${status}</span></div>
      <div class="im-hero-center">
        <div class="im-hero-score" data-hero-score><span>${scoreA}</span>:<span>${scoreB}</span></div>
        <div class="im-hero-teams"><strong>${flag(ta)} ${name(ta)}</strong><span>VS</span><strong>${name(tb)} ${flag(tb)}</strong></div>
        <p>${when}${st==='live' ? ` · ${sc.min}th minute — scroll to replay` : ''}</p>
      </div>
      ${stadium ? `<a class="im-stadium-credit" href="${stadium.page}" target="_blank" rel="noopener">Photo source ↗</a>` : ''}
      <div class="scroll-cue" aria-hidden="true">
        <span>Scroll</span>
        <span class="cue-line"></span>
      </div>
    </section>

    <section class="im-replay" id="replay"><div class="im-replay-inner">
      <div class="im-timeline"><div class="im-label"><strong>MATCH TIMELINE</strong></div><div class="im-clock">0’</div><div class="im-events"><i class="im-event-line"></i>${eventRows}</div></div>
      <div class="im-numbers">
        <div class="im-label"><strong>THE NUMBERS</strong></div>
        <div class="im-stat-teams" aria-label="Statistics compare ${name(ta)} on the left with ${name(tb)} on the right">
          <span><b>${flag(ta)} ${name(ta)}</b></span>
          <i>VS</i>
          <span><b>${name(tb)} ${flag(tb)}</b></span>
        </div>
        ${statRows}
      </div>
    </div></section>
    ${video}
    <section class="im-players"><div class="im-player-stage">
      ${playerLayers}${playerTexts}<div class="im-player-label">KEY PLAYERS</div><div class="im-player-dots">${playerDots}</div>
    </div></section>
    <section class="im-stakes">
      <span>WHAT’S AT STAKE</span><h2>Winner claims</h2><h3>${stake}</h3><p>${key === 'final' ? 'One match from immortality.' : `The road continues through the ${D.ROUNDS[ri+1].name} — then the final.`}</p>
      <a href="index.html#circle">‹ BACK TO THE BRACKET</a>
    </section>`;

  // Assign remote media through the CSSOM so punctuation in Wikimedia URLs
  // cannot break an inline style declaration.
  if (stadium?.url) root.querySelector('.im-hero')?.style.setProperty('--stadium-photo', `url(${JSON.stringify(stadium.url)})`);
  root.querySelectorAll('[data-player-name]').forEach((layer) => {
    const photo = (D.PLAYER_IMAGES || {})[layer.dataset.playerName];
    if (photo?.url) layer.style.setProperty('--player-photo', `url(${JSON.stringify(photo.url)})`);
  });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer:fine)').matches;
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  if (fine && window.gsap) {
    const dot=q('.cursor-dot'), ring=q('.cursor-ring');
    gsap.set([dot,ring],{xPercent:-50,yPercent:-50});
    const dx=gsap.quickTo(dot,'x',{duration:.08}), dy=gsap.quickTo(dot,'y',{duration:.08});
    const rx=gsap.quickTo(ring,'x',{duration:.32}), ry=gsap.quickTo(ring,'y',{duration:.32});
    addEventListener('mousemove',e=>{gsap.to([dot,ring],{opacity:1,duration:.2});dx(e.clientX);dy(e.clientY);rx(e.clientX);ry(e.clientY);},{passive:true});
  }
  const setPlayer = i => {
    qa('[data-player-layer]').forEach((e,n)=>e.classList.toggle('active',n===i));
    qa('[data-player-copy]').forEach((e,n)=>e.classList.toggle('active',n===i));
    qa('[data-player-dot]').forEach((e,n)=>e.classList.toggle('active',n===i));
  };
  qa('[data-player-dot]').forEach((e,i)=>e.addEventListener('click',()=>setPlayer(i)));
  setPlayer(0);

  const nav = document.getElementById('siteNav');
  addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>30),{passive:true});

  // Keep the detail-page navbar behavior identical to the landing page.
  const modeToggle = document.getElementById('modeToggle');
  if (modeToggle) modeToggle.addEventListener('click', () => {
    const nextMode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextMode;
    try { localStorage.setItem('kc-mode', nextMode); } catch { /* private browsing */ }
    dispatchEvent(new CustomEvent('kc:theme', { detail: nextMode }));
  });

  const updateNavPill = () => {
    const pill = nav && nav.querySelector('.nav-live');
    if (!pill || !D.REAL) return;
    const pad = value => String(value).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const liveN = Object.keys(D.LIVE || {}).length;
    const todayN = (D.UPNEXT || []).filter(item => ((D.META || {})[`${item.key}-${item.idx}`] || {}).date === today).length;
    const next = (D.UPNEXT || [])[0];
    const nextDate = next && ((D.META || {})[`${next.key}-${next.idx}`] || {}).date;
    const fmtDate = iso => {
      if (!iso) return '';
      const [, month, day] = iso.split('-');
      return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+month - 1]} ${+day}`.toUpperCase();
    };
    pill.innerHTML = liveN
      ? `<span class="dot-live"></span><span class="lbl">${liveN} LIVE</span>`
      : todayN
        ? `<span class="lbl">${todayN} TODAY</span>`
        : `<span class="lbl">${next ? `NEXT ${fmtDate(nextDate)}` : 'TOURNAMENT OVER'}</span>`;
  };
  updateNavPill();

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    if (!reduced) gsap.from('.im-hero-top > *, .im-hero-center > *',{y:70,opacity:0,duration:1,ease:'power3.out',stagger:.1});
    else gsap.set('.im-hero-top > *, .im-hero-center > *',{clearProps:'all',opacity:1});
    if (!reduced && fine) addEventListener('mousemove',e=>gsap.to('[data-hero-score]',{x:(e.clientX/innerWidth-.5)*26,y:(e.clientY/innerHeight-.5)*14,duration:.6}),{passive:true});
    gsap.to('#imProgress',{scaleX:1,ease:'none',scrollTrigger:{start:0,end:'max',scrub:.3}});
    const replay=gsap.timeline({scrollTrigger:{trigger:'.im-replay',start:'top top',end:'+=1500',scrub:.4,pin:!reduced}});
    const clock={v:0};
    const eventEls=qa('.im-event');
    replay.to(clock,{v:maxMinute,duration:1,ease:'none',onUpdate:()=>{
      const minute=Math.round(clock.v);q('.im-clock').textContent=minute+'’';
      eventEls.forEach(e=>e.classList.toggle('active',+e.dataset.minute<=minute));
    }},0).to('.im-event-line',{scaleY:1,duration:1,ease:'none'},0);
    qa('.im-stat').forEach(row=>{
      const bar=row.querySelector('i'); gsap.to(bar,{width:bar.dataset.width+'%',duration:1.2,ease:'power3.out',scrollTrigger:{trigger:row,start:'top 82%'}});
      row.querySelectorAll('[data-target]').forEach(el=>{const raw=el.dataset.target,to=+raw,o={v:0};gsap.to(o,{v:to,duration:1.2,scrollTrigger:{trigger:row,start:'top 82%'},onUpdate:()=>el.textContent=raw.includes('.')?o.v.toFixed(2):Math.round(o.v)});});
    });
    ScrollTrigger.create({trigger:'.im-players',start:'top top',end:`+=${Math.max(1,players.length)*520}`,pin:!reduced,onUpdate:self=>setPlayer(Math.min(players.length-1,Math.floor(self.progress*players.length)))});
    gsap.from('.im-stakes > *:not(footer)',{y:70,opacity:0,stagger:.1,duration:.9,ease:'power3.out',scrollTrigger:{trigger:'.im-stakes',start:'top 72%'}});
    ScrollTrigger.refresh();
  } else {
    q('#imProgress').style.display='none';
    qa('.im-stat i').forEach(e=>e.style.width=e.dataset.width+'%');
    qa('[data-target]').forEach(e=>e.textContent=e.dataset.target);
  }
})();

/* Knockout Immersive — dynamic match story derived from the Claude Design export. */
(() => {
  const KC = window.KC;
  const D = window.KC_DATA;
  const MF = window.KC_MATCH_FACTS;
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
  const report = meta.num != null ? (D.MATCH_REPORTS || {})[meta.num] || null : null;
  const facts = MF?.buildMatchFacts({ meta, status:st, score:{...sc, penScore:result?.penScore}, source:source || {}, report, liveHealth:D.LIVE_HEALTH }) || {
    status:st, events:[], teamStats:source?.teamStats || null, reportUrl:report?.reportUrl || null,
  };
  const localWhen = MF?.localKickoff({...meta, kickoffUtc:facts.kickoffUtc}) || {};
  const when = localWhen.local || [meta.date, meta.time].filter(Boolean).join(' · ') || 'Kick-off to be confirmed';
  const whenHtml = localWhen.iso
    ? `<time datetime="${localWhen.iso}">${when}</time><span>YOUR TIME${localWhen.timeZone ? ` · ${localWhen.timeZone}` : ''}</span>`
    : `<span>${when}</span>`;
  const status = st === 'live' ? `LIVE ${sc.min}’` : st === 'finished' ? 'FULL TIME' : 'UPCOMING';
  const maxMinute = st === 'live' ? sc.min : st === 'finished' ? 90 : 0;
  const matchup = [name(ta), name(tb)].sort().join('|');

  const HIGHLIGHTS = D.HIGHLIGHTS || {};
  const highlight = HIGHLIGHTS[matchup];
  const embedId = highlight && (highlight.embedYoutubeId || highlight.youtubeId);
  const embedTitle = highlight && (highlight.embedTitle || highlight.title);
  const stadium = (D.STADIUM_IMAGES || {})[meta.ground];

  const iconOf = (type) => type === 'goal' ? '⚽' : type === 'substitution' ? '↔' : type === 'red-card' ? '🟥' : '🟨';
  const normalizedEvents = (facts.events || []).map((event) => ({
    ...event, code:event.side === 'home' ? a : event.side === 'away' ? b : event.code,
    name:event.player || event.name || event.detail || 'Match event', icon:iconOf(event.type || 'goal'),
  }));
  const events = (normalizedEvents.length ? normalizedEvents : source ? [
    ...(source.goalsA || []).map(g => ({...g, code:a, icon:'⚽',type:'goal'})),
    ...(source.goalsB || []).map(g => ({...g, code:b, icon:'⚽',type:'goal'})),
  ] : []).sort((x,y)=>(parseInt(x.minute,10)||0)-(parseInt(y.minute,10)||0));
  const eventRows = events.length ? events.map(e => `<div class="im-event" data-minute="${parseInt(e.minute,10)||0}">
    <span>${e.minute}’</span><i>${e.icon}</i><strong>${e.name}${e.penalty?' (pen)':''}${e.owngoal?' (og)':''}${e.detail&&e.detail!==e.name?`<small>${e.detail}</small>`:''}</strong><b>${e.code && T[e.code] ? T[e.code].f : '⚽'}</b>
  </div>`).join('') : `<p class="im-empty">${st === 'upcoming' ? 'The timeline begins at kick-off.' : 'No goals recorded in this match.'}</p>`;

  const actualStats = facts.teamStats;
  const statConfig = [
    ['possession','POSSESSION %'], ['attempts','ATTEMPTS · ON TARGET'],
    ['xg','EXPECTED GOALS'], ['passCompletion','PASS COMPLETION %'], ['cards','CARDS'],
  ];
  const stats = actualStats ? statConfig.map(([field,label]) => {
    const va=actualStats.a?.[field], vb=actualStats.b?.[field];
    if (va == null || vb == null) return null;
    const total=(+va||0)+(+vb||0);
    return {
      label,va:field==='attempts'?`${va} (${actualStats.a?.onTarget ?? '–'})`:va,
      vb:field==='attempts'?`${vb} (${actualStats.b?.onTarget ?? '–'})`:vb,
      rawA:va,rawB:vb,pct:total ? (+va/total)*100 : 50,numeric:field!=='attempts',
    };
  }).filter(Boolean).slice(0,5) : [];
  const statRows = stats.length ? stats.map(s => `<div class="im-stat">
    <div><strong ${s.numeric?`data-target="${s.va}"`:''}>${s.numeric?'0':s.va}</strong><span>${s.label}</span><strong ${s.numeric?`data-target="${s.vb}"`:''}>${s.numeric?'0':s.vb}</strong></div>
    <div class="im-stat-track"><i data-width="${Math.max(0,Math.min(100,s.pct))}"></i></div>
  </div>`).join('') : `<p class="im-empty im-stats-empty">Verified match statistics will appear here when available.</p>`;

  const goalCount = (playerName) => events.filter((event) => event.type === 'goal' && event.name === playerName).length;
  const contributionFor = (playerName) => {
    const goals = goalCount(playerName);
    return goals ? `${goals} goal${goals === 1 ? '' : 's'} in this match` : null;
  };
  const foldName = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
  const verifiedPlayer = (playerName, side) => (facts.lineups?.[side] || []).find((player) => foldName(player.name) === foldName(playerName));
  const playerA = ta ? verifiedPlayer(ta.st, 'a') : null;
  const playerB = tb ? verifiedPlayer(tb.st, 'b') : null;
  const players = [
    ta && {side:'a', inXI:!!playerA, num:playerA?.number || '', position:playerA?.position || '', tag:`PLAYER TO WATCH · ${a}`, n:ta.st, teamName:ta.n, flag:ta.f, meta:`${ta.f} ${ta.n}${playerA?.position?` · ${playerA.position}`:''}`, goals:goalCount(ta.st), stat:contributionFor(ta.st) || 'Featured player', hue:42, team:a},
    tb && {side:'b', inXI:!!playerB, num:playerB?.number || '', position:playerB?.position || '', tag:`PLAYER TO WATCH · ${b}`, n:tb.st, teamName:tb.n, flag:tb.f, meta:`${tb.f} ${tb.n}${playerB?.position?` · ${playerB.position}`:''}`, goals:goalCount(tb.st), stat:contributionFor(tb.st) || 'Featured player', hue:210, team:b},
  ].filter(Boolean);
  const playerLayers = players.map((p,i)=>{const photo=(D.PLAYER_IMAGES||{})[p.n];return `<div class="im-player-layer" data-player-layer="${i}" data-player-name="${p.n}" style="--h:${p.hue}"><span>${photo?.shirtNumber || p.num}</span>${photo&&photo.url?`<a href="${photo.fifaUrl||photo.page}" target="_blank" rel="noopener">${photo.fifaUrl?'View on FIFA ↗':'Photo source ↗'}</a>`:''}</div>`;}).join('');
  const playerTexts = players.map((p,i)=>`<div class="im-player-copy" data-player-copy="${i}"><span>${p.tag}</span><h2>${p.n}</h2><strong>${p.meta}</strong><p>${p.stat}</p><button class="im-player-video" type="button" data-player-profile="${i}">Full profile ↗</button></div>`).join('');
  const playerDots = players.map((p,i)=>`<button data-player-dot="${i}" aria-label="Show ${p.n}"></button>`).join('');

  const lineupTeams = [
    {team:ta, code:a, formation:facts.formations?.[0], rows:facts.lineups?.a || []},
    {team:tb, code:b, formation:facts.formations?.[1], rows:facts.lineups?.b || []},
  ];
  const lineupMarkup = lineupTeams.map((side,index)=>`<section class="im-lineup-team ${index===0?'active':''}" data-lineup-team="${index}">
    <div class="im-lineup-team-head"><h3>${flag(side.team)} ${name(side.team)}</h3>${side.formation?`<span>${side.formation}</span>`:''}</div>
    ${side.rows.length ? `<ol>${side.rows.map(player=>`<li><b>${player.number || '–'}</b><span>${player.name}</span><small>${player.position || ''}${player.substitution ? ` · ${player.substitution}` : ''}</small></li>`).join('')}</ol>` : `<p>Verified player-by-player line-ups are not available from the current source yet.</p>`}
  </section>`).join('');

  const bar = (label,value,pct) => `<div class="im-profile-stat"><div class="im-profile-stat-top"><span>${label}</span><b>${value}</b></div><div class="im-profile-stat-track"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div></div>`;
  const plain = (label,value) => `<div class="im-profile-stat im-profile-stat--plain"><span>${label}</span><b>${value}</b></div>`;
  const teamStatBlock = (player) => {
    const s = facts.teamStats?.[player.side];
    const rows = [];
    if (s) {
      if (s.possession != null) rows.push(bar('Possession', `${s.possession}%`, +s.possession));
      if (s.attempts != null) rows.push(plain(s.onTarget != null ? 'Shots (on target)' : 'Shots', s.onTarget != null ? `${s.attempts} (${s.onTarget})` : `${s.attempts}`));
      if (s.xg != null) rows.push(plain('Expected goals (xG)', s.xg));
      if (s.passCompletion != null) rows.push(bar('Pass completion', `${s.passCompletion}%`, +s.passCompletion));
      if (s.cards != null) rows.push(plain('Cards', s.cards));
    }
    if (!rows.length) return `<p class="im-profile-note">Team match statistics appear once this match is under way.</p>`;
    return `<div class="im-profile-stats"><div class="im-profile-stats-head"><span>${player.flag} ${player.teamName} · team in this match</span></div>${rows.join('')}</div>`;
  };
  const profileMarkup = players.map((player,index)=>{
    const media=(D.PLAYER_IMAGES||{})[player.n]||{};
    const videoOk=media.videoVerified===true&&media.youtubeId;
    const shirt=media.shirtNumber || player.num || '–';
    return `<article class="im-profile-card" data-profile-card="${index}" hidden>
    <div class="im-profile-portrait" data-profile-photo="${player.n}">${shirt!=='–'?`<b class="im-profile-shirt">${shirt}</b>`:''}</div>
    <div class="im-profile-copy"><div class="im-profile-copy-inner">
      <span class="im-profile-tag">${player.tag}</span><h2>${player.n}</h2><strong class="im-profile-role">${player.meta}</strong>
      ${player.inXI ? `<div class="im-profile-headline">
        <div><b>${shirt}</b><span>Shirt</span></div>
        <div><b>${player.position||'–'}</b><span>Position</span></div>
        <div><b>${player.goals}</b><span>Goal${player.goals===1?'':'s'} · this match</span></div>
      </div>` : `<p class="im-profile-note">Not listed in the verified starting XI for this match.</p>`}
      ${teamStatBlock(player)}
      ${videoOk?`<div class="im-profile-video"><iframe data-src="https://www.youtube-nocookie.com/embed/${media.youtubeId}?rel=0" title="${media.videoTitle || `${player.n} official video`}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`:`<p class="im-profile-note">Official player video unavailable.</p>`}
      ${media.page?`<a class="im-profile-source" href="${media.fifaUrl||media.page}" target="_blank" rel="noopener">Portrait source ↗</a>`:''}
    </div></div>
  </article>`;}).join('');

  const video = highlight && embedId ? `<section class="im-video-section" aria-labelledby="highlight-title">
    <div class="im-video-head"><span>OFFICIAL MATCH VIDEO</span><h2 id="highlight-title">Watch the highlights</h2></div>
    <div class="im-video">
      <div class="im-video-frame"><iframe src="https://www.youtube.com/embed/${embedId}?rel=0" title="${embedTitle}" loading="lazy" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      <div class="im-video-caption"><div><span>${highlight.embedChannel ? `MATCH VIDEO · ${highlight.embedChannel.toUpperCase()}` : 'OFFICIAL FIFA MATCH HIGHLIGHTS'}</span><strong>${embedTitle}</strong></div><div class="im-video-sources">${highlight.embedYoutubeUrl ? `<a href="${highlight.embedYoutubeUrl}" target="_blank" rel="noopener">Watch video on YouTube ↗</a>` : ''}<a href="${highlight.youtubeUrl}" target="_blank" rel="noopener">Watch FIFA upload ↗</a></div></div>
    </div>
  </section>` : '';

  const next = key === 'final' ? null : KC.nextInfo(key, idx);
  const stake = key === 'final' ? 'The World Cup' : (next && next.oppLabel ? next.oppLabel : `A place in the ${D.ROUNDS[ri+1].name}`);
  const deciding = st === 'finished' ? MF?.decidingFact(facts.teamStats) : null;
  document.title = `${name(ta)} vs ${name(tb)} — Knockout Immersive`;
  root.innerHTML = `
    <section class="im-hero">
      <div class="im-hero-top"><a href="index.html#circle">FIFA WORLD CUP 2026 · ${round.name.toUpperCase()} · TIE ${idx+1}</a><span class="im-live ${st}"><i></i>${status}</span></div>
      <div class="im-hero-center">
        <div class="im-hero-score" data-hero-score><span>${scoreA}</span>:<span>${scoreB}</span></div>
        <div class="im-hero-teams"><strong>${flag(ta)} ${name(ta)}</strong><span>VS</span><strong>${name(tb)} ${flag(tb)}</strong></div>
        <p class="im-match-time" data-match-meta>${whenHtml}${st==='live' ? `<em>${sc.min}th minute · scroll to replay</em>` : ''}</p>
        ${facts.stale?`<p class="im-stale" role="status">Live feed delayed · showing the last verified update</p>`:''}
      </div>
      ${stadium ? `<a class="im-stadium-credit" href="${stadium.page}" target="_blank" rel="noopener">Photo source ↗</a>` : ''}
      <div class="scroll-cue" aria-hidden="true">
        <span>Scroll</span>
        <span class="cue-line"></span>
      </div>
    </section>

    <section class="im-players"><div class="im-player-stage">
      ${playerLayers}${playerTexts}<div class="im-player-label">KEY PLAYERS</div><div class="im-player-dots">${playerDots}</div>
    </div></section>

    <section class="im-lineups" aria-labelledby="lineups-title">
      <div class="im-lineups-head"><span>TEAM SHEETS</span><h2 id="lineups-title">Line-ups &amp; formations</h2>${facts.reportUrl?`<a class="im-lineups-report" href="${facts.reportUrl}" target="_blank" rel="noopener">Open the official FIFA report ↗</a>`:''}</div>
      <div class="im-lineup-tabs" role="tablist"><button type="button" class="active" data-lineup-tab="0">${name(ta)}</button><button type="button" data-lineup-tab="1">${name(tb)}</button></div>
      <div class="im-pitch" aria-hidden="true"><span></span><i></i><b></b></div>
      <div class="im-lineup-grid">${lineupMarkup}</div>
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
        ${deciding?`<aside class="im-decision"><span>WHAT DECIDED IT</span><p>${deciding}</p></aside>`:''}
      </div>
    </div></section>
    ${video}
    <section class="im-stakes">
      <span>WHAT’S AT STAKE</span><h2>Winner claims</h2><h3>${stake}</h3><p>${key === 'final' ? 'One match from immortality.' : `The road continues through the ${D.ROUNDS[ri+1].name} — then the final.`}</p>
      <a href="index.html#circle">‹ BACK TO THE BRACKET</a>
    </section>
    <div class="im-dialog" data-profile-dialog role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" hidden>
      <div class="im-dialog-shell"><div class="im-dialog-head"><span id="profile-dialog-title">KEY PLAYER PROFILE</span><button type="button" data-close-dialog aria-label="Close player profile">Close ×</button></div>${profileMarkup}</div>
    </div>`;

  // Assign remote media through the CSSOM so punctuation in Wikimedia URLs
  // cannot break an inline style declaration.
  if (stadium?.url) root.querySelector('.im-hero')?.style.setProperty('--stadium-photo', `url(${JSON.stringify(stadium.url)})`);
  root.querySelectorAll('[data-player-name]').forEach((layer) => {
    const photo = (D.PLAYER_IMAGES || {})[layer.dataset.playerName];
    if (photo?.url) {
      layer.style.setProperty('--player-photo', `url(${JSON.stringify(photo.url)})`);
      layer.style.setProperty('--player-focus', photo.focalPoint || '50% 20%');
    }
  });
  root.querySelectorAll('[data-profile-photo]').forEach((portrait) => {
    const photo = (D.PLAYER_IMAGES || {})[portrait.dataset.profilePhoto];
    if (photo?.url) {
      portrait.style.setProperty('--profile-photo', `url(${JSON.stringify(photo.url)})`);
      portrait.style.setProperty('--profile-focus', photo.focalPoint || '50% 20%');
    }
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

  let returnFocus = null;
  const closeDialog = (dialog) => {
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    dialog.querySelectorAll('iframe').forEach((frame) => frame.removeAttribute('src'));
    document.body.classList.remove('im-dialog-open');
    returnFocus?.focus();
    returnFocus = null;
  };
  const openDialog = (dialog, trigger) => {
    if (!dialog) return;
    returnFocus = trigger;
    dialog.hidden = false;
    document.body.classList.add('im-dialog-open');
    dialog.querySelector('[data-close-dialog]')?.focus();
  };
  qa('[data-player-profile]').forEach((button) => button.addEventListener('click', () => {
    const index = +button.dataset.playerProfile;
    const dialog = q('[data-profile-dialog]');
    qa('[data-profile-card]').forEach((card, cardIndex) => { card.hidden = cardIndex !== index; });
    const frame = dialog?.querySelector(`[data-profile-card="${index}"] iframe[data-src]`);
    if (frame) frame.src = frame.dataset.src;
    openDialog(dialog, button);
  }));
  qa('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('.im-dialog'))));
  qa('.im-dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog);
  }));
  qa('[data-lineup-tab]').forEach((button) => button.addEventListener('click', () => {
    const index = +button.dataset.lineupTab;
    qa('[data-lineup-tab]').forEach((tab, tabIndex) => tab.classList.toggle('active', tabIndex === index));
    qa('[data-lineup-team]').forEach((team, teamIndex) => team.classList.toggle('active', teamIndex === index));
  }));
  document.addEventListener('keydown', (event) => {
    const dialog = qa('.im-dialog').find((item) => !item.hidden);
    if (!dialog) return;
    if (event.key === 'Escape') { closeDialog(dialog); return; }
    if (event.key !== 'Tab') return;
    const focusable = qa('a[href],button:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])').filter((node) => dialog.contains(node) && !node.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

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

  // Minute-only changes update in place. A goal or status transition reloads
  // the story once so its timeline, score, statistics and stakes stay coherent.
  addEventListener('kc:live', () => {
    updateNavPill();
    const nextStatus = KC.statusOf(key, idx);
    const nextScore = KC.scoreOf(key, idx);
    if (nextStatus !== st || nextScore.a !== sc.a || nextScore.b !== sc.b) {
      location.reload();
      return;
    }
    if (nextStatus === 'live') {
      const pill = q('.im-live');
      const matchMeta = q('[data-match-meta]');
      if (pill) pill.innerHTML = `<i></i>LIVE ${nextScore.min}’`;
      if (matchMeta) matchMeta.innerHTML = `${whenHtml}<em>${nextScore.min}th minute · scroll to replay</em>`;
    }
  });

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

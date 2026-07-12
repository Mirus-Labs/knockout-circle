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


  const goalCount = (playerName) => events.filter((event) => event.type === 'goal' && event.name === playerName).length;
  const contributionFor = (playerName) => {
    const goals = goalCount(playerName);
    return goals ? `${goals} goal${goals === 1 ? '' : 's'} in this match` : null;
  };
  const foldName = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
  const verifiedPlayer = (playerName, side) => (facts.lineups?.[side] || []).find((player) => foldName(player.name) === foldName(playerName));
  const statsFor = (playerName) => (D.PLAYER_STATS || {})[foldName(playerName)] || null;
  const teamOf = (side) => side === 'a' ? ta : tb;
  const codeOf = (side) => side === 'a' ? a : b;
  const recId = (side, playerName) => `${side}:${foldName(playerName)}`;

  // Diamond radar (top/right/bottom/left) from up to four 0–100 axes.
  const radarSvg = (radar) => {
    if (!radar || !radar.length) return '';
    const cx = 170, cy = 138, R = 96, dirs = [[0,-1],[1,0],[0,1],[-1,0]];
    const axes = radar.slice(0, 4);
    const at = (i, val) => [cx + dirs[i][0]*R*val/100, cy + dirs[i][1]*R*val/100];
    const pts = (vals) => vals.map((v,i)=>at(i,v).map(n=>n.toFixed(1)).join(',')).join(' ');
    const rings = [25,50,75,100].map(pc=>`<polygon class="im-radar-ring" points="${pts(axes.map(()=>pc))}"/>`).join('');
    const spokes = axes.map((_,i)=>`<line class="im-radar-axis" x1="${cx}" y1="${cy}" x2="${at(i,100)[0].toFixed(1)}" y2="${at(i,100)[1].toFixed(1)}"/>`).join('');
    const area = `<polygon class="im-radar-area" points="${pts(axes.map(a=>Math.max(0,Math.min(100,a.v))))}"/>`;
    const dots = axes.map((a,i)=>{const p=at(i,Math.max(0,Math.min(100,a.v)));return `<circle class="im-radar-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5"/>`;}).join('');
    const lp = [[cx,cy-R-22,'middle'],[cx+R+14,cy-2,'start'],[cx,cy+R+30,'middle'],[cx-R-14,cy-2,'end']];
    const labels = axes.map((a,i)=>`<text class="im-radar-axislabel" x="${lp[i][0]}" y="${lp[i][1]}" text-anchor="${lp[i][2]}">${a.l.toUpperCase()}</text><text class="im-radar-axisval" x="${lp[i][0]}" y="${lp[i][1]+18}" text-anchor="${lp[i][2]}">${a.v}</text>`).join('');
    return `<svg class="im-radar" viewBox="0 0 340 300" role="img" aria-label="Performance radar">${rings}${spokes}${area}${dots}${labels}</svg>`;
  };

  // One record per player (all starters of both teams, plus the featured pair).
  const buildRecord = (playerName, side, tag) => {
    const team = teamOf(side), lu = verifiedPlayer(playerName, side), st = statsFor(playerName);
    const media = (D.PLAYER_IMAGES || {})[playerName] || {};
    return {
      id: recId(side, playerName), name: playerName, side, code: codeOf(side),
      teamName: team ? team.n : '', flag: team ? team.f : '',
      tag: tag || `${team ? team.f : ''} ${team ? team.n : ''}`.trim(),
      number: lu?.number ?? media.shirtNumber ?? '', position: lu?.position || st?.pos || '',
      substitution: lu?.substitution || '', inXI: !!lu, goals: goalCount(playerName),
      stats: st, media, photo: media.url || st?.photo || '',
      focus: media.url ? (media.focalPoint || '50% 20%') : 'center 14%',
      videoOk: media.videoVerified === true && !!media.youtubeId,
    };
  };
  const records = {};
  const register = (playerName, side, tag) => { const r = buildRecord(playerName, side, tag); records[r.id] = r; return r; };
  ['a','b'].forEach((side) => (facts.lineups?.[side] || []).forEach((p) => register(p.name, side)));
  const players = [ta && register(ta.st, 'a', `PLAYER TO WATCH · ${a}`), tb && register(tb.st, 'b', `PLAYER TO WATCH · ${b}`)]
    .filter(Boolean).map((r, i) => ({ ...r, hue: i === 0 ? 42 : 210 }));

  const playerLayers = players.map((p,i)=>`<div class="im-player-layer" data-player-layer="${i}" data-player-name="${p.name}" style="--h:${p.hue}"><span>${p.number||''}</span>${p.media.url?`<a href="${p.media.fifaUrl||p.media.page}" target="_blank" rel="noopener">${p.media.fifaUrl?'View on FIFA ↗':'Photo source ↗'}</a>`:''}</div>`).join('');
  const playerTexts = players.map((p,i)=>`<div class="im-player-copy" data-player-copy="${i}"><span>${p.tag}</span><h2>${p.name}</h2><strong>${p.flag} ${p.teamName}${p.position?` · ${p.position}`:''}</strong><p>${contributionFor(p.name)||'Key player'}</p><button class="im-player-video" type="button" data-player-open="${p.id}">Full profile ↗</button></div>`).join('');
  const playerDots = players.map((p,i)=>`<button data-player-dot="${i}" aria-label="Show ${p.name}"></button>`).join('');

  // Position the starting XI by formation; fall back to grouping by position code.
  const sliceRows = (arr, counts) => { const rows = []; let k = 0; counts.forEach(c => { rows.push(arr.slice(k, k+c)); k += c; }); return rows; };
  const formationRows = (formationStr, starters) => {
    const gk = starters.find(p => /gk|goalkeep/i.test(p.position)) || starters[0];
    const outfield = starters.filter(p => p !== gk);
    let counts = String(formationStr || '').split('-').map(n => parseInt(n, 10)).filter(n => n > 0);
    if (!counts.length || counts.reduce((s,n)=>s+n,0) !== outfield.length) {
      const df = outfield.filter(p => /df|def|back/i.test(p.position));
      const fw = outfield.filter(p => /fw|st|striker|forward|wing/i.test(p.position) && !df.includes(p));
      const mf = outfield.filter(p => !df.includes(p) && !fw.includes(p));
      counts = [df.length, mf.length, fw.length].filter(n => n > 0);
      return { gk, rows: sliceRows([...df, ...mf, ...fw], counts) };
    }
    return { gk, rows: sliceRows(outfield, counts) };
  };
  const pitchTeam = (side, topHalf, hue) => {
    const starters = (facts.lineups?.[side] || []).filter(p => p.starter !== false).slice(0, 11);
    if (starters.length < 11) return '';
    const { gk, rows } = formationRows(side === 'a' ? facts.formations?.[0] : facts.formations?.[1], starters);
    const marker = (p, x, y) => `<button class="im-pitch-player" data-player-open="${recId(side, p.name)}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--h:${hue}" aria-label="Scout ${p.name}"><b>${p.number || ''}</b><span>${p.name.split(' ').pop() || p.name}</span></button>`;
    const out = [marker(gk, 50, topHalf ? 7 : 93)];
    const nR = rows.length;
    rows.forEach((row, ri) => { const t = nR <= 1 ? 0.5 : ri/(nR-1); const y = topHalf ? 17 + t*27 : 83 - t*27; row.forEach((p, j) => out.push(marker(p, (j+1)/(row.length+1)*100, y))); });
    return out.join('');
  };
  const pitchMarkup = `${pitchTeam('a', true, 42)}${pitchTeam('b', false, 210)}`;

  const teamSheet = (side, team, formation) => {
    const rows = facts.lineups?.[side] || [];
    return `<section class="im-lineup-team ${side === 'a' ? 'active' : ''}" data-lineup-team="${side === 'a' ? 0 : 1}">
      <div class="im-lineup-team-head"><h3>${flag(team)} ${name(team)}</h3>${formation ? `<span>${formation}</span>` : ''}</div>
      ${rows.length ? `<ol>${rows.map(p => `<li><b>${p.number || '–'}</b><button class="im-lineup-name" type="button" data-player-open="${recId(side, p.name)}"><span>${p.name}</span><small>${p.position || ''}${p.substitution ? ` · ${p.substitution}` : ''}</small></button></li>`).join('')}</ol>` : `<p>Verified player-by-player line-ups are not available from the current source yet.</p>`}
    </section>`;
  };
  const sheetA = teamSheet('a', ta, facts.formations?.[0]);
  const sheetB = teamSheet('b', tb, facts.formations?.[1]);

  // Player profile renders on demand into a single reusable dialog.
  const statTrack = (label,value,pct) => `<div class="im-profile-stat"><div class="im-profile-stat-top"><span>${label}</span><b>${value}</b></div><div class="im-profile-stat-track"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div></div>`;
  const statPlain = (label,value) => `<div class="im-profile-stat im-profile-stat--plain"><span>${label}</span><b>${value}</b></div>`;
  const teamStatBlock = (side) => {
    const s = facts.teamStats?.[side], team = teamOf(side);
    if (!s) return '';
    const rows = [];
    if (s.possession != null) rows.push(statTrack('Possession', `${s.possession}%`, +s.possession));
    if (s.attempts != null) rows.push(statPlain(s.onTarget != null ? 'Shots (on target)' : 'Shots', s.onTarget != null ? `${s.attempts} (${s.onTarget})` : `${s.attempts}`));
    if (s.xg != null) rows.push(statPlain('Expected goals (xG)', s.xg));
    if (s.passCompletion != null) rows.push(statTrack('Pass completion', `${s.passCompletion}%`, +s.passCompletion));
    if (!rows.length) return '';
    return `<div class="im-profile-stats"><div class="im-profile-stats-head"><span>${team ? team.f : ''} ${team ? team.n : ''} · team in this match</span></div>${rows.join('')}</div>`;
  };
  const renderProfile = (rec) => {
    const shirt = rec.number || '–', st = rec.stats;
    const headline = rec.inXI
      ? `<div class="im-profile-headline"><div><b>${shirt}</b><span>Shirt</span></div><div><b>${rec.position||'–'}</b><span>Position</span></div><div><b>${rec.goals}</b><span>Goal${rec.goals===1?'':'s'} · this match</span></div></div>`
      : `<p class="im-profile-note">Not listed in the verified starting XI for this match.</p>`;
    const radarBlock = st
      ? `<div class="im-profile-radar"><div class="im-profile-stats-head"><span>Performance profile · FIFA match metrics</span></div>${radarSvg(st.radar)}<p class="im-profile-meta">${st.min} min · ${st.mp} match${st.mp===1?'':'es'} at this World Cup</p>${(st.top||[]).map(t=>statTrack(`${t.l} <em>/90</em>`, t.v, t.p)).join('')}<p class="im-profile-fine">Axes are per-90 percentiles vs. same-position players (FIFA Enhanced Football Intelligence) — a derived profile, not an official FIFA rating.</p></div>`
      : `<p class="im-profile-note">FIFA performance metrics are not available for this player.</p>`;
    const video = rec.videoOk ? `<div class="im-profile-video"><iframe data-src="https://www.youtube-nocookie.com/embed/${rec.media.youtubeId}?rel=0" title="${rec.media.videoTitle||`${rec.name} official video`}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` : '';
    const source = rec.media.page ? `<a class="im-profile-source" href="${rec.media.fifaUrl||rec.media.page}" target="_blank" rel="noopener">Portrait source ↗</a>` : '';
    return `<article class="im-profile-card">
      <div class="im-profile-portrait">${shirt!=='–'?`<b class="im-profile-shirt">${shirt}</b>`:''}</div>
      <div class="im-profile-copy"><div class="im-profile-copy-inner">
        <span class="im-profile-tag">${rec.tag}</span><h2>${rec.name}</h2><strong class="im-profile-role">${rec.flag} ${rec.teamName}${rec.position?` · ${rec.position}`:''}</strong>
        ${headline}${radarBlock}${teamStatBlock(rec.side)}${video}${source}
      </div></div>`;
  };

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
        <p class="im-match-time" data-match-meta>${whenHtml}${st==='live' ? `<em>${sc.min}th minute · scroll to replay</em>` : ''}</p>
        ${facts.stale?`<p class="im-stale" role="status">Live feed delayed · showing the last verified update</p>`:''}
      </div>
      ${stadium ? `<a class="im-stadium-credit" href="${stadium.page}" target="_blank" rel="noopener">Photo source ↗</a>` : ''}
      <div class="scroll-cue" aria-hidden="true">
        <span>Scroll</span>
        <span class="cue-line"></span>
      </div>
    </section>

    <section class="im-lineups" aria-labelledby="lineups-title">
      <div class="im-lineups-head"><span>TEAM SHEETS</span><h2 id="lineups-title">Line-ups &amp; formations</h2><p class="im-lineups-hint">Tap any player — on the pitch or in a sheet — to scout them.</p>${facts.reportUrl?`<a class="im-lineups-report" href="${facts.reportUrl}" target="_blank" rel="noopener">Open the official FIFA report ↗</a>`:''}</div>
      <div class="im-lineup-tabs" role="tablist"><button type="button" class="active" data-lineup-tab="0">${name(ta)}</button><button type="button" data-lineup-tab="1">${name(tb)}</button></div>
      <div class="im-lineup-stage">
        ${sheetA}
        <div class="im-pitch">${pitchMarkup ? '<span></span><i></i><b></b>' : ''}${pitchMarkup || '<p class="im-pitch-empty">Formation view appears once the verified line-ups are published.</p>'}</div>
        ${sheetB}
      </div>
    </section>

    <section class="im-replay" id="replay"><div class="im-replay-inner">
      <div class="im-timeline"><div class="im-label"><strong>MATCH TIMELINE</strong></div><div class="im-clock">0’</div><div class="im-events"><i class="im-event-line"></i>${eventRows}</div></div>
    </div></section>

    <section class="im-players"><div class="im-player-stage">
      ${playerLayers}${playerTexts}<div class="im-player-label">KEY PLAYERS</div><div class="im-player-dots">${playerDots}</div>
    </div></section>
    ${video}
    <section class="im-stakes">
      <span>WHAT’S AT STAKE</span><h2>Winner claims</h2><h3>${stake}</h3><p>${key === 'final' ? 'One match from immortality.' : `The road continues through the ${D.ROUNDS[ri+1].name} — then the final.`}</p>
      <a href="index.html#circle">‹ BACK TO THE BRACKET</a>
    </section>
    <div class="im-dialog" data-profile-dialog role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" hidden>
      <div class="im-dialog-shell"><div class="im-dialog-head"><span id="profile-dialog-title">KEY PLAYER PROFILE</span><button type="button" data-close-dialog aria-label="Close player profile">Close ×</button></div><div data-profile-body></div></div>
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
  let currentPlayer = 0;
  const setPlayer = i => {
    currentPlayer = i;
    qa('[data-player-layer]').forEach((e,n)=>e.classList.toggle('active',n===i));
    qa('[data-player-copy]').forEach((e,n)=>e.classList.toggle('active',n===i));
    qa('[data-player-dot]').forEach((e,n)=>e.classList.toggle('active',n===i));
  };
  let rotateTimer = players.length > 1 ? setInterval(()=>setPlayer((currentPlayer+1)%players.length), 4800) : null;
  qa('[data-player-dot]').forEach((e,i)=>e.addEventListener('click',()=>{ if(rotateTimer){clearInterval(rotateTimer);rotateTimer=null;} setPlayer(i); }));
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
  const openPlayerProfile = (id, trigger) => {
    const rec = records[id];
    if (!rec) return;
    const dialog = q('[data-profile-dialog]');
    const body = dialog?.querySelector('[data-profile-body]');
    if (!body) return;
    body.innerHTML = renderProfile(rec);
    const portrait = body.querySelector('.im-profile-portrait');
    if (rec.photo && portrait) {
      portrait.style.setProperty('--profile-photo', `url(${JSON.stringify(rec.photo)})`);
      portrait.style.setProperty('--profile-focus', rec.focus);
    }
    const frame = body.querySelector('iframe[data-src]');
    if (frame) frame.src = frame.dataset.src;
    openDialog(dialog, trigger);
  };
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-player-open]');
    if (trigger) openPlayerProfile(trigger.dataset.playerOpen, trigger);
  });
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
    if (!reduced) gsap.from('.im-player-label, .im-player-dots',{y:30,opacity:0,duration:.7,ease:'power3.out',scrollTrigger:{trigger:'.im-players',start:'top 74%'}});
    gsap.from('.im-stakes > *:not(footer)',{y:70,opacity:0,stagger:.1,duration:.9,ease:'power3.out',scrollTrigger:{trigger:'.im-stakes',start:'top 72%'}});
    ScrollTrigger.refresh();
  } else {
    q('#imProgress').style.display='none';
    qa('.im-stat i').forEach(e=>e.style.width=e.dataset.width+'%');
    qa('[data-target]').forEach(e=>e.textContent=e.dataset.target);
  }
})();

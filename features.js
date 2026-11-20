/* 나이테 우체국 — 확장 기능
 * 내 나이테 · 오늘의 편지 · 세대 질문 · 답장 알림(웹 푸시) · 편지함 지키기(카카오) ·
 * 답장 카드 공유 · 표현 점검 · 편지 책 · 기관 전용 우체통 · 후원/문의 · 약관/개인정보처리방침
 * 원칙: 편지 한 통 = 답장 한 통. 상대를 찾거나 다시 연결하는 기능은 만들지 않는다.
 */
(function () {
  'use strict';
  const N = window.Naite;
  if (!N) return;
  const { api, state, CFG, AGE, TOPICS, $, esc, nl2br, store } = N;
  const live = api.mode === 'live';
  const sb = api.sb;
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const SITE_URL = CFG.siteUrl || 'https://nahk227.github.io/naite-post/';

  Object.assign(N.ERRORS, {
    meet_block: '따로 연락하거나 만나자는 내용은 보낼 수 없어요. 나이테 우체국은 편지 한 통, 답장 한 통으로만 이어져요.',
    org_inactive: '지금은 운영하지 않는 우체통이에요.',
  });

  // ==================================================================
  // 안전: 만남·연락 요청 차단 + 상처 주는 표현 점검
  // ==================================================================
  const MEET_RE = /(만나(요|자|서|볼래|볼까|고\s*싶)|만날\s*(래|까|수)|연락\s*(주세요|줘|해\s*줘|드릴게|할게|하자)|번호\s*(알려|줘|좀|교환)|전화\s*(번호|해\s*줘|주세요)|카톡\s*(해|하자|주세요|친추)|디엠|DM|오픈\s*채팅|오픈톡|인스타\s*(팔로|맞팔)|어디\s*사(세요|시나요|니)|주소\s*(알려|좀))/i;
  const TONE_RULES = [
    { re: /(한심|정신\s*(차려|차리)|철\s*좀|그것도\s*못|멍청|바보|등신|병신|미친)/, tip: '비난처럼 들릴 수 있어요. 상대의 마음을 먼저 알아주는 말로 바꿔 보면 어떨까요?' },
    { re: /(배부른\s*소리|복에\s*겨|별것\s*아닌|별거\s*아닌|유난|징징|엄살)/, tip: '고민을 작게 여기는 말처럼 들릴 수 있어요. "그럴 수 있어요"로 시작해 보세요.' },
    { re: /(요즘\s*(애들|젊은\s*것들|것들)|라떼는|꼰대|늙은이|틀딱|MZ\s*(들|는))/, tip: '세대를 묶어 판단하는 말은 상처가 될 수 있어요. 나의 경험을 나누는 말로 바꿔 보세요.' },
    { re: /(니가|네가|당신이)\s*(잘못|문제|이상)/, tip: '탓하는 말처럼 들릴 수 있어요. "나라면 이렇게 해 볼 것 같아요"처럼 써 보세요.' },
  ];
  N.toneCheck = (body) => {
    if (MEET_RE.test(body)) return { block: true, tip: N.ERRORS.meet_block };
    for (const r of TONE_RULES) {
      const m = body.match(r.re);
      if (m) return { block: false, word: m[0], tip: r.tip };
    }
    if (body.trim().length < 30) return { block: false, tip: '답장이 조금 짧아요. 내 세대의 경험을 한두 문장만 더 나눠 주면 큰 힘이 돼요.' };
    return null;
  };
  N.showToneModal = (issue) => {
    N.openModal(`<h2>${issue.block ? '🙅 보낼 수 없는 내용이에요' : '🌿 보내기 전에 한 번만'}</h2>
      ${issue.word ? `<p class="tone-word">“${esc(issue.word)}”</p>` : ''}
      <p>${esc(issue.tip)}</p>
      <button type="button" class="btn primary block" data-action="modal-close">고쳐 쓸게요</button>
      ${issue.block ? '' : '<button type="button" class="link-btn block" data-action="tone-send">그래도 이대로 보낼게요</button>'}`);
  };
  // 고민 편지에도 만남·연락 요청은 막기
  const origSendLetter = api.sendLetter.bind(api);
  api.sendLetter = async (l) => { if (MEET_RE.test(l.body)) throw new Error('meet_block'); return origSendLetter(l); };

  // ==================================================================
  // API 확장 (데모 모드는 이 브라우저 안에서 흉내)
  // ==================================================================
  const demoQ = { id: 'demo-q', body: '부모님(또는 자녀)에게 가장 듣고 싶었던 한마디는 무엇인가요?', ends_on: '', mine: store.get('naite_demo_answer', null), total: 3,
    groups: [{ age_group: 2, cnt: 1, samples: ['(예시) 네가 하고 싶은 걸 해도 괜찮아'] }, { age_group: 6, cnt: 2, samples: ['(예시) 엄마 덕분에 잘 컸어요', '(예시) 고마워요, 아빠'] }] };
  const X = {
    async rings() {
      if (!live) {
        const [ls, rs] = await Promise.all([api.myLetters(), api.myReplies()]);
        return { letters: ls.length, replies: rs.length, practice: 0, answers: demoQ.mine ? 1 : 0, stamps: await api.stampsReceived(), since: null };
      }
      return must(await sb.rpc('my_rings'));
    },
    async today() { return live ? must(await sb.rpc('today_letter')) : null; },
    async question() { return live ? must(await sb.rpc('current_question')) : demoQ; },
    async answer(qid, body) {
      if (!live) { demoQ.mine = body; store.set('naite_demo_answer', body); return; }
      must(await sb.from('answers').insert({ question_id: qid, body }));
    },
    async pushKey() { return live ? must(await sb.rpc('push_public_key')) : null; },
    async savePush(sub) {
      const j = sub.toJSON();
      must(await sb.rpc('save_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }));
    },
    async removePush(endpoint) { must(await sb.rpc('remove_push', { p_endpoint: endpoint })); },
    async joinOrg(code) { if (!live) throw new Error('org_not_found'); return must(await sb.rpc('join_org', { p_code: code })); },
    async leaveOrg() { if (live) must(await sb.rpc('leave_org')); },
    async myOrg() { return live ? must(await sb.rpc('my_org')) : null; },
    async setShare(kind, id, ok) { if (live) must(await sb.rpc('set_share', { p_kind: kind, p_id: id, p_ok: ok })); },
  };
  N.x = X;

  // ==================================================================
  // 내 나이테
  // ==================================================================
  function ringCount(r) { return (r.letters || 0) + (r.replies || 0) + (r.practice || 0) + (r.answers || 0); }
  function ringsSvg(n) {
    const total = Math.min(n, 28);
    const size = 132; const C = size / 2; const core = 7; const step = (C - core - 4) / Math.max(total, 6);
    let s = `<svg viewBox="0 0 ${size} ${size}" class="rings-svg" aria-hidden="true"><defs>
      <radialGradient id="rg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e8b878"/><stop offset="1" stop-color="#8a5a30"/></radialGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <circle cx="${C}" cy="${C}" r="${C - 2}" fill="#3a2414"/>
      <circle cx="${C}" cy="${C}" r="${C - 6}" fill="url(#rg)"/>`;
    for (let i = total; i >= 1; i--) {
      const r = core + i * step;
      const newest = i === total && n > 0;
      s += `<circle cx="${C}" cy="${C}" r="${r.toFixed(1)}" fill="none" stroke="${newest ? '#ffd58a' : (i % 2 ? '#7a4a22' : '#a8743f')}" stroke-width="${newest ? 2.6 : 1.4}" ${newest ? 'filter="url(#glow)"' : ''} opacity="${newest ? 1 : 0.75}"/>`;
    }
    s += `<circle cx="${C}" cy="${C}" r="${core}" fill="#e0482f"/></svg>`;
    return s;
  }
  async function homeRings(box) {
    const el = document.createElement('section');
    el.className = 'feature-card rings-card';
    el.innerHTML = '<p class="muted">내 나이테를 세는 중…</p>';
    box.appendChild(el);
    try {
      const r = await X.rings();
      const n = ringCount(r);
      window.NaiteScene.setRings && window.NaiteScene.setRings(n);
      el.innerHTML = `<div class="rings-visual">${ringsSvg(n)}</div>
        <div class="rings-text">
          <p class="kicker">🌳 내 나이테</p>
          ${n ? `<h3><b>${n}</b>개의 나이테가 새겨졌어요</h3>` : '<h3>첫 나이테를 새겨 보세요</h3>'}
          <p class="rings-meta">보낸 고민 <b>${r.letters || 0}</b> · 쓴 답장 <b>${r.replies || 0}</b> · 연습 <b>${r.practice || 0}</b> · 세대 질문 <b>${r.answers || 0}</b></p>
          <p class="rings-meta">받은 고마워요 우표 <b>${r.stamps || 0}</b>장 💌</p>
        </div>`;
    } catch (e) { el.remove(); }
  }

  // ==================================================================
  // 오늘의 편지
  // ==================================================================
  async function homeToday(box) {
    const el = document.createElement('section');
    el.className = 'feature-card today-card';
    box.appendChild(el);
    let t = null;
    try { t = await X.today(); } catch (e) { /* 없음 */ }
    if (!t) {
      el.innerHTML = `<p class="kicker">📰 오늘의 편지</p>
        <h3>첫 '오늘의 편지'를 기다리고 있어요</h3>
        <p class="muted">고민을 쓴 분과 답장한 분이 <b>모두</b> 공개에 동의한 편지만, 이름 없이 이곳에 소개돼요.</p>`;
      return;
    }
    el.innerHTML = `<p class="kicker">📰 오늘의 편지</p>
      <div class="mini-paper"><span class="mini-who">${esc(AGE[t.author_age])}의 고민 · ${esc(TOPICS[t.topic] || '')}</span><p>${nl2br(t.body)}</p></div>
      <div class="mini-arrow">↓ ${esc(AGE[t.reply_age])}의 답장</div>
      <div class="mini-paper reply"><p>${nl2br(t.reply_body)}</p></div>
      <p class="small muted">두 분 모두 공개에 동의한 편지예요. 글쓴이에게 연락할 수 있는 방법은 없어요.</p>`;
  }

  // ==================================================================
  // 세대 질문
  // ==================================================================
  async function homeQuestion(box) {
    let q = null;
    try { q = await X.question(); } catch (e) { return; }
    if (!q) return;
    const el = document.createElement('a');
    el.className = 'feature-card question-card tilt';
    el.href = '#question';
    el.innerHTML = `<p class="kicker">🗣️ 이번 주 세대 질문</p>
      <h3>${esc(q.body)}</h3>
      <p class="muted">${q.total ? `벌써 <b>${q.total}</b>명이 답했어요. 세대별 답을 비교해 보세요` : '첫 번째로 답하고 세대별 답을 열어 보세요'} →</p>`;
    box.appendChild(el);
  }

  async function viewQuestion() {
    N.render('<p class="center muted pad">질문을 불러오는 중…</p>');
    let q;
    try { q = await X.question(); } catch (e) { return N.render(`<p class="center pad">${esc(N.errMsg(e))}</p>`); }
    if (!q) {
      return N.render(`<h1 class="page-title">🗣️ 세대 질문</h1><section class="card"><p>이번 주 질문을 준비하고 있어요. 곧 찾아올게요!</p><a class="btn primary block" href="#home">처음으로</a></section>`);
    }
    const max = Math.max(1, ...q.groups.map((g) => g.cnt));
    const groups = [1, 2, 3, 4, 5, 6].map((a) => {
      const g = q.groups.find((x) => x.age_group === a) || { cnt: 0, samples: [] };
      return `<div class="gen-col">
        <div class="gen-head"><b>${esc(AGE[a])}</b><span>${g.cnt}명</span></div>
        <div class="gen-bar"><i style="width:${Math.round((g.cnt / max) * 100)}%"></i></div>
        ${(g.samples || []).map((s) => `<p class="gen-say">“${esc(s)}”</p>`).join('') || '<p class="gen-say empty">아직 답이 없어요</p>'}
      </div>`;
    }).join('');
    N.render(`<h1 class="page-title">🗣️ 이번 주 세대 질문</h1>
      <p class="page-sub">같은 질문, 세대마다 다른 대답. 모든 답은 이름 없이 보여요.</p>
      <section class="card q-card">
        <p class="q-body">${esc(q.body)}</p>
        ${q.mine
          ? `<p class="q-mine">내 답: “${esc(q.mine)}”</p>`
          : `<div class="write-box"><textarea id="q-body" maxlength="300" rows="3" placeholder="한두 문장으로 답해 주세요"></textarea></div>
             <button type="button" class="btn primary block" data-action="q-send" data-v="${esc(q.id)}">답하고 다른 세대 답 보기</button>`}
      </section>
      ${q.mine ? `<div class="gen-grid">${groups}</div>` : `<div class="gen-grid locked">${groups}<div class="lock-cover">🔒 답하면 다른 세대의 답이 열려요</div></div>`}`);
  }

  // ==================================================================
  // 답장 알림 (웹 푸시)
  // ==================================================================
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }
  async function swReg() { return navigator.serviceWorker.register('sw.js'); }
  async function pushState() {
    if (!pushSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      return sub ? 'on' : 'off';
    } catch (e) { return 'off'; }
  }
  async function enablePush() {
    if (!live) { N.toast('데모 모드에서는 알림을 켤 수 없어요.'); return false; }
    if (!pushSupported()) {
      N.toast(isIOS() && !isStandalone() ? '아이폰은 공유 버튼 → "홈 화면에 추가" 후 알림을 켤 수 있어요.' : '이 브라우저는 알림을 지원하지 않아요.');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { N.toast('알림이 허용되지 않았어요. 브라우저 설정에서 허용할 수 있어요.'); return false; }
    const reg = await swReg();
    await navigator.serviceWorker.ready;
    const key = await X.pushKey();
    if (!key) { N.toast('알림 서버를 준비하는 중이에요. 잠시 뒤 다시 시도해 주세요.'); return false; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    await X.savePush(sub);
    N.toast('답장이 도착하면 알려드릴게요 🔔');
    return true;
  }
  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { try { await X.removePush(sub.endpoint); } catch (e) { /* 무시 */ } await sub.unsubscribe(); }
    N.toast('알림을 껐어요.');
  }
  async function homeNotify(box) {
    if (!live || !pushSupported() || store.get('naite_push_dismiss', false)) return;
    if ((await pushState()) !== 'off' || Notification.permission === 'denied') return;
    const el = document.createElement('section');
    el.className = 'feature-card notify-card';
    el.innerHTML = `<div class="notify-bell">🔔</div><div><h3>답장이 오면 알려드릴까요?</h3>
      <p class="muted">느린 우편이라 몇 시간 뒤 도착해요. 놓치지 않게 알려드릴게요.</p>
      <div class="row-gap"><button type="button" class="btn primary small" data-action="push-on">알림 켜기</button>
      <button type="button" class="link-btn" data-action="push-dismiss">괜찮아요</button></div></div>`;
    box.appendChild(el);
  }
  async function viewNotify() {
    const st = await pushState();
    const ios = isIOS() && !isStandalone();
    N.render(`<h1 class="page-title">🔔 답장 알림</h1>
      <p class="page-sub">답장이 도착하면 휴대폰이나 컴퓨터로 알려드려요.</p>
      <section class="card">
        ${!live ? '<p>데모 모드에서는 알림을 쓸 수 없어요.</p>'
          : st === 'on' ? '<p class="big-state">✅ 알림이 켜져 있어요</p><button type="button" class="btn block" data-action="push-off">알림 끄기</button>'
          : st === 'denied' ? '<p>이 브라우저에서 알림이 <b>차단</b>되어 있어요. 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꿔 주세요.</p>'
          : st === 'unsupported' ? (ios
            ? '<p>아이폰에서는 먼저 <b>홈 화면에 추가</b>해야 알림을 받을 수 있어요.</p><ol class="steps-ol"><li>아래쪽 <b>공유 버튼(□↑)</b>을 눌러요</li><li><b>"홈 화면에 추가"</b>를 눌러요</li><li>홈 화면의 나이테 우체국을 열고 이 화면에서 알림을 켜요</li></ol>'
            : '<p>이 브라우저는 알림을 지원하지 않아요. 크롬이나 엣지, 사파리 최신 버전에서 열어 주세요.</p>')
          : '<p class="big-state">알림이 꺼져 있어요</p><button type="button" class="btn primary block" data-action="push-on">🔔 알림 켜기</button>'}
        <p class="small muted">알림에는 고민이나 답장 내용이 들어가지 않아요. "답장이 도착했어요"라는 소식만 보내요.</p>
      </section>`);
  }

  // ==================================================================
  // 편지함 지키기 (카카오 로그인 연결)
  // ==================================================================
  async function viewAccount() {
    let linked = false;
    if (live) {
      try { const { data } = await sb.auth.getUser(); linked = (data.user?.identities || []).some((i) => i.provider === 'kakao'); } catch (e) { /* 무시 */ }
    }
    N.render(`<h1 class="page-title">🔐 편지함 지키기</h1>
      <p class="page-sub">지금 편지함은 <b>이 브라우저</b>에만 연결돼 있어요. 기록을 지우거나 기기를 바꾸면 사라질 수 있어요.</p>
      <section class="card">
        ${!CFG.kakaoLogin ? `<p class="big-state">🛠️ 카카오 연결을 준비하고 있어요</p>
            <p class="muted">그동안은 <b>같은 기기, 같은 브라우저</b>로 들어오면 편지함이 그대로 있어요. 인터넷 기록(쿠키)을 지우지 않도록 주의해 주세요.</p>`
          : linked ? '<p class="big-state">✅ 카카오로 지켜지고 있어요</p><p class="muted">다른 기기에서도 카카오로 로그인하면 내 편지함을 볼 수 있어요.</p>'
          : `<p>카카오 계정을 연결하면 기기를 바꿔도 편지함이 유지돼요. <b>다른 사람에게는 카카오 정보가 절대 보이지 않아요.</b></p>
             <button type="button" class="btn kakao block" data-action="kakao-link">카카오로 편지함 지키기</button>
             <hr><p class="small muted">이미 다른 기기에서 카카오로 연결했나요?</p>
             <button type="button" class="link-btn" data-action="kakao-login">카카오로 내 편지함 불러오기</button>
             <p class="small muted">※ 불러오면 이 브라우저의 현재 편지함 대신 카카오에 연결된 편지함이 열려요.</p>`}
      </section>`);
  }

  // ==================================================================
  // 답장 카드 (이미지로 공유)
  // ==================================================================
  function wrapLines(ctx, text, maxW, maxLines) {
    const lines = []; let line = '';
    for (const ch of text.replace(/\s+/g, ' ')) {
      const t = line + ch;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = ch.trimStart(); if (lines.length === maxLines) break; }
      else line = t;
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && text.length > lines.join('').length + 2) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{2}$/, '…');
    return lines;
  }
  async function drawCard(reply, letter) {
    try { await document.fonts.ready; } catch (e) { /* 무시 */ }
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12231d'); bg.addColorStop(1, '#0a120f'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.2, 80, 0, W * 0.2, 80, 700); glow.addColorStop(0, 'rgba(255,150,70,.35)'); glow.addColorStop(1, 'rgba(255,150,70,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // 나이테
    g.save(); g.translate(W - 120, H - 130);
    for (let r = 420; r > 10; r -= 22) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.strokeStyle = `rgba(255,190,120,${0.05 + (420 - r) / 4200})`; g.lineWidth = 3; g.stroke(); }
    g.restore();
    // 편지지
    const px = 90, py = 250, pw = W - 180, ph = 820;
    g.save(); g.translate(W / 2, py + ph / 2); g.rotate(-0.012); g.translate(-W / 2, -(py + ph / 2));
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
    g.fillStyle = '#fbfff9'; g.fillRect(px, py, pw, ph); g.shadowColor = 'transparent';
    g.strokeStyle = '#dcefe4'; g.lineWidth = 2;
    for (let y = py + 200; y < py + ph - 40; y += 74) { g.beginPath(); g.moveTo(px + 50, y); g.lineTo(px + pw - 50, y); g.stroke(); }
    g.fillStyle = '#4fc38f'; g.fillRect(px, py, 10, ph);
    // 테이프
    g.fillStyle = 'rgba(140,220,180,.85)'; g.fillRect(W / 2 - 90, py - 22, 180, 46);
    g.fillStyle = '#2a211b'; g.font = '700 38px "Noto Sans KR", sans-serif';
    g.fillText(`${AGE[reply.author_age] || ''}의 답장`, px + 60, py + 110);
    g.fillStyle = '#6b5d50'; g.font = '30px "Noto Sans KR", sans-serif';
    g.fillText(`${AGE[letter.author_age] || ''}의 ${String(TOPICS[letter.topic] || '고민').replace(/^\S+\s/, '')} 고민에`, px + 60, py + 160);
    g.fillStyle = '#2a211b'; g.font = '46px "Gowun Batang", serif';
    const lines = wrapLines(g, reply.body, pw - 120, 8);
    lines.forEach((ln, i) => g.fillText(ln, px + 60, py + 255 + i * 74));
    g.restore();
    // 제목·주소
    g.fillStyle = '#f6ecdc'; g.font = '64px "Black Han Sans", sans-serif'; g.fillText('나이테 우체국에', 90, 130);
    g.fillStyle = '#ffd58a'; g.fillText('답장이 도착했어요', 90, 205);
    g.fillStyle = '#c9bba6'; g.font = '30px "Noto Sans KR", sans-serif';
    g.fillText('다른 세대에게 고민을 부치면, 답장이 돌아와요', 90, 1170);
    g.fillStyle = '#ffd58a'; g.font = '700 32px "Noto Sans KR", sans-serif'; g.fillText(SITE_URL.replace(/^https?:\/\//, ''), 90, 1222);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  async function shareCard(replyId) {
    const list = await api.myLetters();
    const l = list.find((x) => x.reply && x.reply.id === replyId);
    if (!l) return N.toast('답장을 찾지 못했어요.');
    N.openModal('<p class="center">답장 카드를 만드는 중…</p>');
    const blob = await drawCard(l.reply, l);
    const url = URL.createObjectURL(blob);
    const file = new File([blob], 'naite-reply.png', { type: 'image/png' });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    N.openModal(`<h2>📸 답장 카드</h2>
      <img src="${url}" alt="답장 카드 미리보기" class="card-preview">
      <p class="small muted">이름도 연락처도 없는 익명 답장이에요. 다른 분이 쓴 글이니 소중히 나눠 주세요.</p>
      ${canShare ? '<button type="button" class="btn primary block" data-action="card-share">공유하기</button>' : ''}
      <a class="btn block" href="${url}" download="naite-reply.png">이미지 저장</a>
      <button type="button" class="link-btn block" data-action="modal-close">닫기</button>`);
    shareCard.file = file;
  }

  // ==================================================================
  // 편지 책 (인쇄 / PDF 저장)
  // ==================================================================
  async function viewBook() {
    N.render('<p class="center muted pad">편지 책을 엮는 중…</p>');
    let letters = [], replies = [];
    try { [letters, replies] = await Promise.all([api.myLetters(), api.myReplies()]); } catch (e) { return N.render(`<p class="center pad">${esc(N.errMsg(e))}</p>`); }
    const sent = letters.filter((l) => l.status !== 'held');
    const total = sent.length + replies.length;
    const d = new Date();
    N.render(`<div class="book-tools no-print">
        <h1 class="page-title">📖 내 편지 책</h1>
        <p class="page-sub">주고받은 편지를 한 권으로 엮었어요. 인쇄하거나 PDF로 저장할 수 있어요.</p>
        <div class="row-gap"><button type="button" class="btn primary" data-action="book-print">🖨️ 인쇄 / PDF로 저장</button>
        <a class="btn" href="#support">실물 책 주문 문의</a></div>
      </div>
      <article class="book">
        <section class="book-cover">
          <div class="book-rings">${ringsSvg(total)}</div>
          <h2>나의 나이테 편지 책</h2>
          <p>${esc(AGE[state.profile.age_group])}의 기록 · ${d.getFullYear()}년 ${d.getMonth() + 1}월</p>
          <p class="book-count">편지 ${sent.length}통 · 답장 ${replies.length}통</p>
        </section>
        ${total === 0 ? '<p class="book-empty">아직 엮을 편지가 없어요. 첫 편지를 보내 보세요.</p>' : ''}
        ${sent.length ? '<h3 class="book-ch">1부. 내가 부친 고민</h3>' : ''}
        ${sent.map((l) => `<section class="book-entry">
            ${N.letterPaper({ who: `내 고민 · ${N.TARGETS[l.target].label}`, topic: l.topic, date: N.dateLabel(l.created_at), body: l.body, cls: 'mine' })}
            ${l.reply ? N.letterPaper({ who: `${AGE[l.reply.author_age]}의 답장`, date: N.dateLabel(l.reply.deliver_at), body: l.reply.body, cls: 'reply' }) : '<p class="book-wait">답장을 기다리는 중</p>'}
          </section>`).join('')}
        ${replies.length ? '<h3 class="book-ch">2부. 내가 건넨 답장</h3>' : ''}
        ${replies.map((r) => `<section class="book-entry">
            ${N.letterPaper({ who: `${AGE[(r.letter || {}).author_age] || ''}의 편지`, topic: (r.letter || {}).topic, body: (r.letter || {}).body || '', cls: 'mine' })}
            ${N.letterPaper({ who: '내가 쓴 답장', date: N.dateLabel(r.created_at), body: r.body, cls: 'reply' })}
          </section>`).join('')}
        <p class="book-end">— 나이테 우체국 —</p>
      </article>`);
  }

  // ==================================================================
  // 기관 전용 우체통
  // ==================================================================
  async function viewOrg() {
    let org = null;
    try { org = await X.myOrg(); } catch (e) { /* 무시 */ }
    N.render(`<h1 class="page-title">🏢 기관 전용 우체통</h1>
      <p class="page-sub">복지관·회사·학교가 함께 쓰는 전용 우체통이에요. 같은 우체통 안에서만 편지가 오가요.</p>
      <section class="card">
        ${org ? `<p class="big-state">지금 <b>${esc(org.name)}</b> 우체통에 있어요</p>
            <p class="muted">이 우체통 안의 사람들끼리만 고민과 답장이 오가요.</p>
            <button type="button" class="btn block" data-action="org-leave">전체 우체통으로 돌아가기</button>`
          : `<p>기관에서 받은 <b>우체통 코드</b>를 입력해 주세요.</p>
            <input id="org-code" class="text-input" maxlength="20" placeholder="예: SEOUL2026" autocomplete="off">
            <button type="button" class="btn primary block" data-action="org-join">들어가기</button>`}
        <hr><p class="small muted">우리 기관에도 전용 우체통이 필요하다면 <a href="#support">문의하기</a></p>
      </section>`);
  }
  async function joinOrg(code) {
    try {
      const r = await X.joinOrg(code);
      N.toast(`${r.name} 우체통에 들어왔어요 🏢`);
      location.hash = '#home'; N.route();
    } catch (e) { N.toast(N.errMsg(e)); }
  }

  // ==================================================================
  // 후원 · 문의
  // ==================================================================
  function viewSupport() {
    const mail = CFG.contactEmail;
    N.render(`<h1 class="page-title">💛 우체국 나무에 물 주기</h1>
      <p class="page-sub">나이테 우체국은 광고 없이 운영돼요. 고민 옆에 광고를 붙이지 않는 것이 약속이에요.</p>
      <section class="card support-card">
        <h2>🌱 후원하기</h2>
        <p class="muted">서버비와 편지 배달에 쓰여요. 후원 여부는 편지 배달에 아무 영향이 없어요.</p>
        ${CFG.donateUrl ? `<a class="btn primary block" href="${esc(CFG.donateUrl)}" target="_blank" rel="noopener">후원 페이지로 가기</a>` : '<p class="big-state">후원 창구를 준비하고 있어요</p>'}
      </section>
      <section class="card">
        <h2>📖 실물 편지 책 주문</h2>
        <p class="muted">주고받은 편지를 예쁜 책이나 엽서로 만들어 드려요. <a href="#book">내 편지 책 미리보기</a></p>
        ${mail ? `<a class="btn block" href="mailto:${esc(mail)}?subject=${encodeURIComponent('[나이테 우체국] 편지 책 주문 문의')}">주문 문의하기</a>` : '<p class="big-state">주문 창구를 준비하고 있어요</p>'}
      </section>
      <section class="card">
        <h2>🏢 기관 전용 우체통</h2>
        <p class="muted">복지관의 어르신 '답장 선배' 프로그램, 회사의 직원 마음 우체통, 학교의 고민 우체통을 만들어 드려요.</p>
        ${mail ? `<a class="btn block" href="mailto:${esc(mail)}?subject=${encodeURIComponent('[나이테 우체국] 기관 전용 우체통 문의')}">도입 문의하기</a>` : '<p class="big-state">문의 창구를 준비하고 있어요</p>'}
        <a class="link-btn" href="#org">우체통 코드가 있어요</a>
      </section>`);
  }

  // ==================================================================
  // 이용약관 · 개인정보처리방침
  // ==================================================================
  const OP = esc(CFG.operatorName || '나이테 우체국 운영자');
  const MAIL = CFG.contactEmail ? `<a href="mailto:${esc(CFG.contactEmail)}">${esc(CFG.contactEmail)}</a>` : '(문의 이메일 준비 중)';
  const EFFECTIVE = esc(CFG.policyDate || '2026년 11월 20일');
  function legal(title, body) {
    N.render(`<h1 class="page-title">${title}</h1><article class="card legal">${body}
      <p class="small muted">시행일: ${EFFECTIVE}</p></article>
      <p class="center"><a href="#home">처음으로</a></p>`);
  }
  function viewPrivacy() {
    legal('개인정보처리방침', `
      <p>${OP}(이하 "운영자")는 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고, 관련 고충을 신속하게 처리하기 위해 다음과 같이 개인정보처리방침을 둡니다.</p>
      <h3>1. 처리하는 개인정보 항목</h3>
      <ul>
        <li><b>필수</b>: 나이대, 서비스 이용을 위한 익명 계정 식별값(이름·전화번호·이메일을 받지 않습니다)</li>
        <li><b>선택</b>: 성별, 답장 알림을 위한 브라우저 알림 구독 정보, 편지함 연결을 위한 카카오 계정 식별값(연결한 경우에만)</li>
        <li><b>이용자가 직접 작성한 내용</b>: 고민 편지, 답장, 세대 질문 답변. 작성 내용에 건강·가족 등 민감한 정보가 포함될 수 있으므로, 실명·연락처·주소 등 나를 알아볼 수 있는 정보는 적지 말아 주세요. 전화번호·이메일·링크·SNS 아이디는 자동으로 가려집니다.</li>
        <li><b>자동 수집</b>: 서비스 이용 기록, 접속 로그(보안·오류 대응 목적)</li>
      </ul>
      <h3>2. 처리 목적</h3>
      <ul><li>다른 세대 이용자에게 편지를 무작위로 배달하고 답장을 전달</li><li>답장 도착 알림 발송</li><li>마음이 많이 힘든 내용이 담긴 편지의 우선 확인 및 도움받을 수 있는 곳 안내</li><li>신고 처리, 부정 이용 방지, 서비스 개선</li></ul>
      <h3>3. 공개 범위</h3>
      <p>편지와 답장은 배달받은 상대방에게만 보입니다. 고민을 쓴 분과 답장한 분이 <b>모두 동의한 경우에만</b> '오늘의 편지'에 익명으로 소개되며, 세대 질문 답변은 나이대와 함께 익명으로 공개됩니다. 어떤 경우에도 상대방에게 연락하거나 신원을 확인할 수 있는 방법은 제공하지 않습니다.</p>
      <h3>4. 보유 및 이용 기간</h3>
      <p>이용자가 삭제를 요청하거나 마지막 이용일로부터 1년이 지나면 지체 없이 파기합니다. 다만 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관합니다.</p>
      <h3>5. 제3자 제공</h3>
      <p>운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 근거한 요청이 있거나, 이용자의 생명·신체에 급박한 위험이 있다고 판단되는 경우는 예외로 합니다.</p>
      <h3>6. 처리 위탁</h3>
      <ul><li>Supabase Inc. — 데이터 저장, 익명 인증, 알림 발송 서버 (저장 위치: 대한민국 서울 리전)</li><li>GitHub Inc. — 웹사이트 화면 파일 제공(개인정보를 저장하지 않음)</li><li>브라우저 제조사의 푸시 서비스(Google, Apple, Mozilla 등) — 알림 전달(알림을 켠 경우, 편지 내용은 전달하지 않음)</li></ul>
      <h3>7. 파기 절차 및 방법</h3>
      <p>보유 기간이 지나거나 처리 목적이 달성된 개인정보는 복구할 수 없는 방법으로 삭제합니다.</p>
      <h3>8. 이용자의 권리</h3>
      <p>이용자는 언제든지 자신의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다. 아래 문의처로 요청해 주세요. 편지함은 계정과 연결되어 있으므로, 요청 시 본인 확인 절차가 필요할 수 있습니다.</p>
      <h3>9. 만 14세 미만 아동</h3>
      <p>나이테 우체국은 만 14세 미만 아동의 가입과 이용을 받지 않습니다.</p>
      <h3>10. 안전성 확보 조치</h3>
      <p>접근 권한 최소화(행 단위 접근 제어), 전송 구간 암호화(HTTPS), 연락처 자동 가림, 운영자 접근 기록 관리 등 기술적·관리적 조치를 하고 있습니다.</p>
      <h3>11. 개인정보 보호책임자 및 문의</h3>
      <p>책임자: ${OP}<br>문의: ${MAIL}</p>
      <p class="small muted">개인정보 침해 신고·상담: 개인정보침해신고센터(국번 없이 118), 개인정보분쟁조정위원회(1833-6972)</p>
      <h3>12. 변경</h3><p>이 방침이 바뀌면 시행 7일 전부터 서비스 화면을 통해 알립니다.</p>`);
  }
  function viewTerms() {
    legal('이용약관', `
      <h3>제1조 (목적)</h3><p>이 약관은 ${OP}가 제공하는 '나이테 우체국'(이하 "서비스")의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정합니다.</p>
      <h3>제2조 (서비스의 내용)</h3><p>서비스는 이용자가 쓴 고민 편지를 다른 세대의 이용자에게 무작위로 배달하고, 답장을 전달하는 익명 편지 서비스입니다. 편지 한 통에는 답장 한 통만 오가며, 이용자 사이의 연락·만남을 위한 기능은 제공하지 않습니다.</p>
      <h3>제3조 (이용 자격)</h3><p>만 14세 이상이면 누구나 회원가입 없이 이용할 수 있습니다.</p>
      <h3>제4조 (이용자의 의무)</h3><ul>
        <li>연락처·SNS 계정·주소를 주고받거나, 만남을 제안하지 않습니다.</li>
        <li>다른 이용자를 비난·조롱하거나 차별·혐오 표현을 쓰지 않습니다.</li>
        <li>광고·홍보, 금전 요구, 종교·정치 권유를 하지 않습니다.</li>
        <li>타인의 개인정보나 실명을 적지 않습니다.</li></ul>
      <h3>제5조 (게시물 관리)</h3><p>운영자는 제4조를 어기거나 신고된 편지·답장을 숨기거나 배달을 중단할 수 있고, 반복해서 어긴 이용자의 이용을 제한할 수 있습니다. 위기 신호가 담긴 편지는 운영자가 먼저 확인한 뒤 배달합니다.</p>
      <h3>제6조 (전문 상담이 아님)</h3><p>답장은 다른 이용자의 개인적인 경험과 생각이며, 의료·법률·심리 상담을 대신하지 않습니다. 급하게 도움이 필요할 때는 전문 상담 기관이나 112·119에 연락해 주세요.</p>
      <h3>제7조 (게시물의 권리)</h3><p>편지와 답장의 권리는 작성자에게 있습니다. 운영자는 서비스 제공을 위해서만 이를 이용하며, '오늘의 편지' 등 공개는 작성자 모두의 동의가 있을 때에만 합니다.</p>
      <h3>제8조 (유료 서비스)</h3><p>후원, 편지 책 제작, 기관 전용 우체통 등 유료 서비스의 조건은 각 안내 화면 또는 별도 계약에 따릅니다. 후원 여부는 편지 배달에 영향을 주지 않습니다.</p>
      <h3>제9조 (책임의 한계)</h3><p>운영자는 이용자 사이에 오간 편지 내용의 정확성이나, 이를 따른 결과에 대해 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.</p>
      <h3>제10조 (약관의 변경)</h3><p>약관을 바꿀 때에는 시행 7일 전부터 서비스 화면에 알립니다.</p>
      <h3>문의</h3><p>${MAIL}</p>`);
  }

  // ==================================================================
  // 등록
  // ==================================================================
  N.homeExtras.push(() => {
    const box = $('#home-extras');
    if (!box) return;
    homeNotify(box);
    homeRings(box).then(() => homeQuestion(box)).then(() => homeToday(box)).then(async () => {
      try {
        const org = await X.myOrg();
        if (org) {
          const b = document.createElement('a'); b.className = 'org-banner'; b.href = '#org';
          b.innerHTML = `🏢 지금 <b>${esc(org.name)}</b> 전용 우체통에 있어요`;
          box.prepend(b);
        }
      } catch (e) { /* 무시 */ }
    });
  });
  Object.assign(N.views, { question: viewQuestion, notify: viewNotify, account: viewAccount, book: viewBook, org: viewOrg, support: viewSupport });
  Object.assign(N.publicViews, { privacy: viewPrivacy, terms: viewTerms });

  // ?org=코드 로 들어오면 전용 우체통 안내
  N.bootHooks.push(async () => {
    const code = new URLSearchParams(location.search).get('org');
    if (!code || !state.profile) return;
    history.replaceState(null, '', location.pathname + location.hash);
    setTimeout(() => N.openModal(`<h2>🏢 전용 우체통 초대</h2><p>우체통 코드 <b>${esc(code)}</b>로 초대받았어요. 들어갈까요?</p>
      <button type="button" class="btn primary block" data-action="org-join-code" data-v="${esc(code)}">들어가기</button>
      <button type="button" class="link-btn block" data-action="modal-close">나중에</button>`), 300);
  });

  // 서비스 워커 (알림 클릭 처리 등)
  if (live && 'serviceWorker' in navigator) { window.addEventListener('load', () => { swReg().catch(() => {}); }); }

  // ==================================================================
  // 이벤트
  // ==================================================================
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action; const v = el.dataset.v;
    try {
      switch (a) {
        case 'tone-send': await N.retrySendReply(); break;
        case 'q-send': {
          const body = ($('#q-body').value || '').trim();
          if (body.length < 2) return N.toast('한두 문장으로 답해 주세요.');
          if (MEET_RE.test(body)) return N.toast(N.ERRORS.meet_block);
          el.disabled = true;
          await X.answer(v, body); N.toast('답했어요! 다른 세대의 답을 열어 볼게요 🗣️'); viewQuestion();
          break;
        }
        case 'push-on': el.disabled = true; if (await enablePush()) { if (location.hash === '#notify') viewNotify(); else el.closest('.notify-card')?.remove(); } el.disabled = false; break;
        case 'push-off': await disablePush(); viewNotify(); break;
        case 'push-dismiss': store.set('naite_push_dismiss', true); el.closest('.notify-card')?.remove(); break;
        case 'share-card': await shareCard(v); break;
        case 'card-share':
          try { await navigator.share({ files: [shareCard.file], title: '나이테 우체국 답장 카드', text: '다른 세대에게서 답장이 도착했어요 🌳' }); }
          catch (e) { /* 사용자가 취소 */ }
          break;
        case 'book-print': window.print(); break;
        case 'org-join': { const code = ($('#org-code').value || '').trim(); if (!code) return N.toast('우체통 코드를 입력해 주세요.'); await joinOrg(code); break; }
        case 'org-join-code': N.closeModal(); await joinOrg(v); break;
        case 'org-leave': await X.leaveOrg(); N.toast('전체 우체통으로 돌아왔어요.'); viewOrg(); break;
        case 'kakao-link': {
          const r = await sb.auth.linkIdentity({ provider: 'kakao', options: { redirectTo: SITE_URL + '#account' } });
          if (r.error) throw r.error;
          break;
        }
        case 'kakao-login': {
          if (!confirm('카카오에 연결된 편지함을 불러올까요? 이 브라우저의 현재 편지함 대신 열려요.')) return;
          const r = await sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: SITE_URL + '#inbox' } });
          if (r.error) throw r.error;
          break;
        }
        default: break;
      }
    } catch (e) { el.disabled = false; N.toast(N.errMsg(e)); }
  });
})();

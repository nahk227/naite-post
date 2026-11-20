/* 나이테 우체국 — 세대 교차 고민 우체통 (시제품 v0.1) */
(function () {
  'use strict';

  const CFG = window.NAITE_CONFIG || {};
  window.NaiteScene = window.NaiteScene || { setMode() {}, burst() {} };

  // ------------------------------------------------------------------
  // 상수
  // ------------------------------------------------------------------
  const AGE = { 1: '10대', 2: '20대', 3: '30대', 4: '40대', 5: '50대', 6: '60대 이상' };
  const GENDER = { f: '여성', m: '남성', x: '말하지 않을래요' };
  const TOPICS = {
    family: '👪 가족', work: '💼 일·진로', love: '💞 연애·결혼', money: '💰 돈',
    health: '🩺 건강', lonely: '🌙 외로움', etc: '📝 그 밖의 고민',
  };
  const TARGETS = {
    older: { label: '인생 선배에게', desc: '나보다 나이 많은 분께' },
    younger: { label: '젊은 세대에게', desc: '나보다 어린 분께' },
    any: { label: '아무에게나', desc: '누구든 마음 닿는 분께' },
  };
  const PROMPTS = [
    '요즘 마음에 걸리는 일이 있나요? 편하게 적어 주세요.',
    '누구에게도 말 못 한 이야기, 여기서는 괜찮아요.',
    '다른 세대의 생각이 궁금한 고민이 있나요?',
  ];
  const HEADLINES = [
    '열아홉의 고민에<br><em>예순아홉</em>이 답장합니다',
    '서른의 불안에<br><em>일흔의 여유</em>가 도착합니다',
    '엄마 나이의 고민에<br><span class="alt">딸 나이</span>가 답장합니다',
    '퇴사 고민엔<br><em>은퇴한 선배</em>의 한마디',
    '아버지의 스마트폰 고민에<br><span class="alt">스물둘</span>이 답장합니다',
  ];
  let headlineTimer = null;
  function rotateHeadline() {
    clearInterval(headlineTimer);
    let i = 0;
    headlineTimer = setInterval(() => {
      const el = document.getElementById('headline');
      if (!el) { clearInterval(headlineTimer); return; }
      el.classList.add('swap');
      setTimeout(() => { i = (i + 1) % HEADLINES.length; el.innerHTML = HEADLINES[i]; el.classList.remove('swap'); }, 500);
    }, 4200);
  }
  const ERRORS = {
    daily_limit: '오늘은 편지를 3통까지 보낼 수 있어요. 내일 다시 보내 주세요.',
    blocked: '이용이 제한된 계정이에요.',
    not_your_letter: '이 편지는 이미 다른 분께 넘어갔어요. 다른 편지를 받아 주세요.',
    profile_required: '먼저 나이대를 알려 주세요.',
    question_closed: '이 질문은 마감됐어요. 다음 질문을 기다려 주세요.',
    org_not_found: '우체통 코드를 찾을 수 없어요. 다시 확인해 주세요.',
    duplicate: '이미 답했어요. 질문 하나에 한 번만 답할 수 있어요.',
    'Anonymous sign-ins are disabled': '지금은 우체국 문을 여는 중이에요. 잠시 뒤 다시 와 주세요. (운영자: Supabase 익명 로그인을 켜 주세요)',
  };

  const CRISIS_RE = /(죽고\s*싶|자살|자해|목숨을\s*끊|사라지고\s*싶|살기\s*싫|극단적\s*선택|유서)/;

  function maskContacts(t) {
    return String(t)
      .replace(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[연락처 가림]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[연락처 가림]')
      .replace(/(https?:\/\/|www\.)\S+/gi, '[링크 가림]')
      .replace(/open\.kakao\.com\S*/gi, '[링크 가림]')
      .replace(/(카톡|카카오톡|인스타|텔레그램|라인)\s*(아이디|id|ID)?\s*[:：]?\s*[A-Za-z0-9_.]{3,}/g, '$1 [아이디 가림]')
      .replace(/@[A-Za-z0-9_.]{3,}/g, '[아이디 가림]');
  }

  // ------------------------------------------------------------------
  // 유틸
  // ------------------------------------------------------------------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
  };
  const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  function dateLabel(iso) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  function errMsg(e) {
    const m = (e && (e.message || e.msg)) || String(e);
    for (const k of Object.keys(ERRORS)) if (m.includes(k)) return ERRORS[k];
    console.error(e);
    return '잠시 문제가 생겼어요. 조금 뒤 다시 시도해 주세요.';
  }

  // ------------------------------------------------------------------
  // 데이터 계층 1: 데모 (localStorage)
  // ------------------------------------------------------------------
  function DemoApi() {
    const KEY = 'naite_demo_v1';
    const SAMPLES = [
      { age: 2, topic: 'work', target: 'older', body: '입사 2년 차인데 매일 아침 출근길이 너무 무겁습니다. 그만두고 다른 길을 찾고 싶은데, 지금 그만두면 도망치는 것 같아 망설여져요. 인생 선배님들은 이럴 때 어떻게 하셨나요?' },
      { age: 6, topic: 'family', target: 'younger', body: '다 큰 자식에게 서운한 마음이 드는데 말을 꺼내기가 어렵습니다. 연락이 뜸한 게 바빠서인 줄 알면서도 섭섭해요. 젊은 사람들은 부모가 어떻게 해 주길 바라나요?' },
      { age: 4, topic: 'money', target: 'any', body: '아이 학원비와 대출 이자 때문에 저축을 전혀 못 하고 있어요. 다들 어떻게 버티시는지, 작은 방법이라도 듣고 싶습니다.' },
      { age: 1, topic: 'lonely', target: 'older', body: '반 친구들과 잘 어울리지 못해서 쉬는 시간이 제일 힘들어요. 어른이 되면 이런 마음이 좀 괜찮아지나요?' },
      { age: 5, topic: 'health', target: 'any', body: '건강검진 결과가 좋지 않게 나와서 요즘 밤마다 걱정이 많습니다. 비슷한 일을 겪어 보신 분이 있다면 마음을 어떻게 다잡으셨는지 궁금해요.' },
      { age: 3, topic: 'love', target: 'any', body: '결혼을 앞두고 있는데 설렘보다 걱정이 더 커요. 이게 자연스러운 건지, 다들 이런 마음이었는지 궁금합니다.' },
    ];
    let db = store.get(KEY, null);
    if (!db) {
      db = {
        me: newId(), profile: null, replies: [], skips: [], stamps: 0,
        letters: SAMPLES.map((s, i) => ({
          id: newId(), author_id: 'demo-' + i, author_age: s.age, topic: s.topic, target: s.target,
          body: s.body, status: 'waiting', is_crisis: false, claimed_by: null, claimed_at: null,
          created_at: new Date(Date.now() - (i + 1) * 3600e3).toISOString(),
        })),
      };
      save();
    }
    function save() { store.set(KEY, db); }
    const ok = (v) => Promise.resolve(v);
    const fail = (m) => Promise.reject(new Error(m));
    const replyOf = (letterId) => db.replies.find((r) => r.letter_id === letterId) || null;

    return {
      mode: 'demo',
      init() { return ok(db.profile); },
      saveProfile(p) { db.profile = { ...(db.profile || { id: db.me, stamps_received: 0 }), ...p }; save(); return ok(db.profile); },
      refreshProfile() { return ok(db.profile); },
      sendLetter({ topic, target, body, share_ok }) {
        const mine = db.letters.filter((l) => l.author_id === db.me && Date.now() - Date.parse(l.created_at) < 864e5);
        if (mine.length >= 3) return fail('daily_limit');
        const clean = maskContacts(body);
        const crisis = CRISIS_RE.test(clean);
        const letter = {
          id: newId(), author_id: db.me, author_age: db.profile.age_group, topic, target, body: clean,
          status: crisis ? 'held' : 'answered', is_crisis: crisis, claimed_by: null, claimed_at: null,
          created_at: new Date().toISOString(),
        };
        db.letters.push(letter);
        if (!crisis) {
          // 데모용 자동 답장 (실제 서비스에서는 다른 세대의 사람이 씀)
          const my = db.profile.age_group;
          const from = target === 'older' ? Math.min(6, my + 2) : target === 'younger' ? Math.max(1, my - 2) : (my >= 4 ? 2 : 6);
          db.replies.push({
            id: newId(), letter_id: letter.id, author_id: 'demo-replier', author_age: from,
            body: '(데모 답장)\n편지 잘 받았어요. 이런 이야기를 꺼내기까지 얼마나 고민하셨을지 생각하니 마음이 쓰였어요.\n실제 서비스에서는 다른 세대의 누군가가 직접 쓴 답장이 이 자리에 도착해요.',
            deliver_at: new Date(Date.now() + (CFG.demoReplyDelaySec || 20) * 1000).toISOString(),
            thanked: false, created_at: new Date().toISOString(),
          });
        }
        save();
        return ok(letter);
      },
      claimLetter() {
        const me = db.me; const my = db.profile.age_group;
        let l = db.letters.find((x) => x.claimed_by === me && x.status === 'claimed');
        if (l) return ok(l);
        const cands = db.letters.filter((x) => x.status === 'waiting' && !x.is_crisis && x.author_id !== me
          && !db.skips.includes(x.id)
          && (x.target === 'any' || (x.target === 'older' && my > x.author_age) || (x.target === 'younger' && my < x.author_age)))
          .sort((a, b) => (Number(b.author_age !== my) - Number(a.author_age !== my)) || a.created_at.localeCompare(b.created_at));
        l = cands[0];
        if (!l) return ok(null);
        l.status = 'claimed'; l.claimed_by = me; l.claimed_at = new Date().toISOString();
        save();
        return ok(l);
      },
      practiceReply(id) { if (!db.skips.includes(id)) db.skips.push(id); save(); return ok(); },
      skipLetter(id) {
        const l = db.letters.find((x) => x.id === id);
        if (!db.skips.includes(id)) db.skips.push(id);
        if (l && l.claimed_by === db.me) { l.status = 'waiting'; l.claimed_by = null; l.claimed_at = null; }
        save(); return ok();
      },
      sendReply(letterId, body) {
        const l = db.letters.find((x) => x.id === letterId);
        if (!l || l.claimed_by !== db.me || l.status !== 'claimed') return fail('not_your_letter');
        db.replies.push({
          id: newId(), letter_id: letterId, author_id: db.me, author_age: db.profile.age_group,
          body: maskContacts(body), deliver_at: new Date(Date.now() + 3 * 3600e3).toISOString(),
          // 데모: 내가 쓴 답장 중 일부는 상대가 고마워한 것으로 표시
          thanked: Math.random() < 0.5, created_at: new Date().toISOString(),
        });
        l.status = 'answered';
        save(); return ok();
      },
      myLetters() {
        const now = Date.now();
        return ok(db.letters.filter((l) => l.author_id === db.me)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((l) => { const r = replyOf(l.id); return { ...l, reply: r && Date.parse(r.deliver_at) <= now ? r : null }; }));
      },
      myReplies() {
        return ok(db.replies.filter((r) => r.author_id === db.me)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((r) => ({ ...r, letter: db.letters.find((l) => l.id === r.letter_id) })));
      },
      thank(replyId) { const r = db.replies.find((x) => x.id === replyId); if (r) r.thanked = true; save(); return ok(); },
      report() { return ok(); },
      stats() {
        return ok({ letters: db.letters.length, replies: db.replies.length,
          waiting: db.letters.filter((l) => l.status === 'waiting').length });
      },
      stampsReceived() { return ok(db.replies.filter((r) => r.author_id === db.me && r.thanked).length); },
    };
  }

  // ------------------------------------------------------------------
  // 데이터 계층 2: Supabase (실서비스)
  // ------------------------------------------------------------------
  function SupaApi() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    let user = null;
    const must = ({ data, error }) => { if (error) throw error; return data; };
    const one = (v) => (Array.isArray(v) ? v[0] || null : v || null);

    async function getProfile() {
      return must(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
    }

    return {
      mode: 'live',
      sb,
      async init() {
        let { data: { session } } = await sb.auth.getSession();
        if (!session) {
          const r = await sb.auth.signInAnonymously();
          if (r.error) throw r.error;
          session = r.data.session;
        }
        user = session.user;
        return getProfile();
      },
      async saveProfile(p) {
        const exists = await getProfile();
        if (exists) must(await sb.from('profiles').update(p).eq('id', user.id));
        else must(await sb.from('profiles').insert({ id: user.id, ...p }));
        return getProfile();
      },
      refreshProfile: getProfile,
      async sendLetter(l) { return must(await sb.from('letters').insert(l).select().single()); },
      async claimLetter() {
        const d = must(await sb.rpc('claim_letter'));
        const l = one(d);
        return l && l.id ? l : null;
      },
      async skipLetter(id) { must(await sb.rpc('skip_letter', { p_letter_id: id })); },
      async sendReply(letterId, body, shareOk) { must(await sb.from('replies').insert({ letter_id: letterId, body, share_ok: !!shareOk })); },
      async practiceReply(letterId) { must(await sb.rpc('practice_reply', { p_letter_id: letterId })); },
      async myLetters() {
        const rows = must(await sb.from('letters').select('*, replies(*)')
          .eq('author_id', user.id).order('created_at', { ascending: false }));
        return rows.map((l) => ({ ...l, reply: one(l.replies) }));
      },
      async myReplies() {
        const rows = must(await sb.from('replies').select('*, letter:letters(*)')
          .eq('author_id', user.id).order('created_at', { ascending: false }));
        return rows.map((r) => ({ ...r, letter: one(r.letter) }));
      },
      async thank(replyId) { must(await sb.rpc('thank_reply', { p_reply_id: replyId })); },
      async report(type, id, reason) {
        must(await sb.from('reports').insert({ target_type: type, target_id: id, reason }));
      },
      async stats() { return must(await sb.rpc('public_stats')); },
      async stampsReceived() { const p = await getProfile(); return p ? p.stamps_received : 0; },
    };
  }

  // ------------------------------------------------------------------
  // 상태
  // ------------------------------------------------------------------
  const live = CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase;
  const api = live ? SupaApi() : DemoApi();
  const state = {
    profile: null,
    ob: { age: null, gender: null },
    draft: { topic: null, target: null, body: '' },
    claimed: null,
    inboxTab: 'sent',
  };
  const seen = new Set(store.get('naite_seen_replies', []));
  const saveSeen = () => store.set('naite_seen_replies', [...seen]);

  // 확장 기능(features.js)과 공유하는 연결부
  const Naite = window.Naite = {
    api, state, CFG, AGE, TOPICS, TARGETS, GENDER, CRISIS_RE, ERRORS,
    $, esc, nl2br, store, dateLabel, errMsg,
    render: (h) => render(h), toast: (m) => toast(m),
    openModal: (h) => openModal(h), closeModal: () => closeModal(),
    letterPaper: (o) => letterPaper(o), route: () => route(),
    retrySendReply: () => { state.toneOk = true; closeModal(); return sendReply(); },
    views: {}, publicViews: {}, homeExtras: [], bootHooks: [],
  };

  // ------------------------------------------------------------------
  // 화면 공통
  // ------------------------------------------------------------------
  const app = $('#app');
  function render(html) { app.innerHTML = html; window.scrollTo(0, 0); }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="modal-box">${html}</div>`; m.hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
  const loading = (msg = '불러오는 중…') => render(`<p class="center muted pad">${esc(msg)}</p>`);

  function letterPaper({ who, topic, date, body, cls = '', age }) {
    return `<article class="paper ${cls}">
      <header class="paper-head">${age && window.NaiteAvatar ? `<span class="pa-av">${window.NaiteAvatar(age, null)}</span>` : ''}<span>${esc(who)}</span>${topic ? `<span class="tag">${esc(TOPICS[topic] || '')}</span>` : ''}</header>
      <div class="paper-body">${nl2br(body)}</div>
      ${date ? `<footer class="paper-foot">${esc(date)}</footer>` : ''}
    </article>`;
  }

  // ------------------------------------------------------------------
  // 화면: 처음 방문
  // ------------------------------------------------------------------
  function viewOnboarding() {
    const { age, gender } = state.ob;
    const editing = !!state.profile;
    render(`${editing ? '<h1 class="page-title">나이대 바꾸기</h1>' : `<section class="hero">
      <p class="eyebrow"><span class="live-dot"></span>가입 없이, 링크 하나로</p>
      <h1 class="display">열아홉의 고민에<br><em>예순아홉</em>이 답장합니다</h1>
      <p class="lead">모르는 사람, 하지만 먼저 그 길을 걸어간 사람.<br>다른 세대에게 고민을 부치면 느리지만 진심 어린 답장이 돌아와요.</p>
    </section>`}
    <section class="ob-card">
      <div class="ob-stage">
        <div class="ob-preview ${age ? 'on' : ''}" id="ob-preview">${obPreview()}</div>
        <div class="ob-bubble" id="ob-bubble">${obBubble()}</div>
      </div>
      <h2 class="ob-title">어떤 세대의 우체부인가요?</h2>
      <p class="ob-sub">다른 세대와 편지를 잇는 데만 써요. 이름이나 연락처는 묻지 않아요.</p>
      <div class="ob-ages">${Object.entries(AGE).map(([k, v]) =>
        `<button type="button" class="ob-age ${age === +k ? 'on' : ''}" data-action="ob-age" data-v="${k}">
          <span class="ob-age-av">${avatar(+k, gender)}</span><b>${v}</b><small>${AGE_NICK[k]}</small></button>`).join('')}</div>
      <h3 class="ob-q">성별 <span>(선택)</span></h3>
      <div class="ob-genders">${Object.entries(GENDER).map(([k, v]) =>
        `<button type="button" class="ob-gender ${gender === k ? 'on' : ''}" data-action="ob-gender" data-v="${k}">${{ f: '👩', m: '👨', x: '🙂' }[k]} ${v}</button>`).join('')}</div>
      <button type="button" class="btn primary block ob-go" data-action="ob-save" ${age ? '' : 'disabled'}>🌳 ${editing ? '이렇게 바꿀게요' : '우체국 들어가기'}</button>
      <p class="small center ob-note">만 14세 이상만 이용할 수 있어요.</p>
    </section>`);
  }

  const AGE_NICK = { 1: '꿈 많은 새싹', 2: '출발선의 청춘', 3: '한창 달리는 중', 4: '든든한 기둥', 5: '노련한 선배', 6: '인생 고수' };
  const avatar = (a, g, title) => (window.NaiteAvatar ? window.NaiteAvatar(a, g, { title }) : '📮');
  function obPreview() {
    const { age, gender } = state.ob;
    return age ? avatar(age, gender, `${AGE[age]} 우체부`) : '<div class="ob-mystery">?</div>';
  }
  function obBubble() {
    const { age } = state.ob;
    return age ? `안녕하세요! <b>${AGE_NICK[age]}</b>, ${AGE[age]} 우체부예요 ✉️` : '나이대를 고르면<br>나만의 우체부가 나타나요!';
  }
  // 선택할 때 화면을 다시 그리지 않고 제자리에서 바꿈 (스크롤 유지)
  function updateOb() {
    const { age, gender } = state.ob;
    document.querySelectorAll('.ob-age').forEach((b) => {
      b.classList.toggle('on', +b.dataset.v === age);
      b.querySelector('.ob-age-av').innerHTML = avatar(+b.dataset.v, gender);
    });
    document.querySelectorAll('.ob-gender').forEach((b) => b.classList.toggle('on', b.dataset.v === gender));
    const p = $('#ob-preview');
    if (p) { p.innerHTML = obPreview(); p.classList.toggle('on', !!age); p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); }
    const bub = $('#ob-bubble'); if (bub) bub.innerHTML = obBubble();
    const go = $('[data-action=ob-save]'); if (go) go.disabled = !age;
  }

  // ------------------------------------------------------------------
  // 화면: 홈
  // ------------------------------------------------------------------
  async function viewHome() {
    const kw = ['#이직', '#첫사랑', '#부모님', '#사춘기', '#노후', '#결혼', '#외로움', '#건강검진', '#꿈', '#돈', '#자취', '#은퇴', '#시험', '#육아'];
    const kw2 = ['인생 선배에게', '젊은 세대에게', '느린 답장', '익명', '연락처 자동 가림', '고마워요 우표', '가입 없음', '다른 세대의 시선'];
    const strip = (arr, sep) => { const s = arr.map((k) => `<span>${esc(k)}</span>`).join(`<span>${sep}</span>`); return s + `<span>${sep}</span>` + s + `<span>${sep}</span>`; };
    render(`<section class="hero">
      <p class="eyebrow"><span class="live-dot"></span>지금 우체국 문이 열려 있어요</p>
      <h1 class="display" id="headline">${HEADLINES[0]}</h1>
      <p class="lead">고민을 부치면, 나와 <b>다른 세대</b>의 누군가가 답장을 보내요.</p>
      <div class="stats-pill" id="stats">📮 우체국 소식을 불러오는 중…</div>
    </section>

    <nav class="menu">
      <a class="menu-btn primary tilt" href="#write"><span class="mi">✉️</span><span class="mt"><b>고민 보내기</b><small>다른 세대에게 털어놓기</small></span><span class="go">→</span></a>
      <a class="menu-btn green tilt" href="#answer"><span class="mi">✍️</span><span class="mt"><b>답장 쓰기</b><small>누군가의 고민에 내 세대의 경험을</small></span><span class="go">→</span></a>
      <a class="menu-btn tilt" href="#inbox"><span class="mi">📬</span><span class="mt"><b>내 편지함<em id="badge" class="badge" hidden></em></b><small>도착한 답장과 받은 우표</small></span><span class="go">→</span></a>
    </nav>
    <div id="home-extras"></div>

    <div class="marquee" aria-hidden="true"><div class="marquee-track">${strip(kw, '✦')}</div></div>
    <div class="marquee" aria-hidden="true"><div class="marquee-track">${strip(kw2, '🌳')}</div></div>

    <h2 class="section-title">편지는 이렇게 오가요</h2>
    <p class="section-sub">빠른 답 대신, 천천히 우려낸 진심</p>
    <div class="steps">
      <div class="step"><span class="step-no">1</span><div><b>고민을 부쳐요</b><span>"인생 선배에게", "젊은 세대에게", "아무에게나" 중에서 받는 사람을 골라요.</span></div></div>
      <div class="step"><span class="step-no">2</span><div><b>다른 세대에게 배달돼요</b><span>이름도 연락처도 없이, 나이대만 함께 전해져요. 연락처는 자동으로 가려져요.</span></div></div>
      <div class="step"><span class="step-no">3</span><div><b>느린 답장이 도착해요</b><span>몇 시간 뒤 답장이 도착하면, 고마운 마음을 우표로 전해요.</span></div></div>
    </div>
    <div class="gen-row" aria-label="함께하는 세대">${Object.values(AGE).map((a) => `<span class="gen">${a}</span>`).join('')}</div>

    <p class="me-line"><span class="me-av">${avatar(state.profile.age_group, state.profile.gender)}</span>나는 <b>${esc(AGE_NICK[state.profile.age_group])}, ${esc(AGE[state.profile.age_group])} 우체부</b> · <a href="#profile">바꾸기</a></p>`);
    Naite.homeExtras.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    rotateHeadline();
    try {
      const s = await api.stats();
      const el = $('#stats');
      if (el) {
        el.innerHTML = s.letters > 0
          ? `📮 지금까지 편지 <b>${s.letters}</b>통 · 답장 <b>${s.replies}</b>통이 오갔어요`
          : '🌱 첫 편지를 기다리고 있어요. 첫 번째 주인공이 되어 주세요';
      }
    } catch (e) { /* 숫자는 없어도 됨 */ }
    try {
      const mine = await api.myLetters();
      const fresh = mine.filter((l) => l.reply && !seen.has(l.reply.id)).length;
      const b = $('#badge');
      if (b && fresh) { b.textContent = `새 답장 ${fresh}`; b.hidden = false; }
    } catch (e) { /* 무시 */ }
  }

  // ------------------------------------------------------------------
  // 화면: 고민 보내기
  // ------------------------------------------------------------------
  function viewWrite() {
    const d = state.draft; const my = state.profile.age_group;
    const targets = Object.entries(TARGETS).filter(([k]) => !(k === 'older' && my === 6) && !(k === 'younger' && my === 1));
    const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    render(`<h1 class="page-title">✉️ 고민 보내기</h1>
    <p class="page-sub">다른 세대의 누군가가 천천히 읽고 답장해 드려요.</p>
    <section class="card">
      <h2>1. 어떤 고민인가요?</h2>
      <div class="choices grid2">${Object.entries(TOPICS).map(([k, v]) =>
        `<button type="button" class="choice ${d.topic === k ? 'on' : ''}" data-action="w-topic" data-v="${k}">${v}</button>`).join('')}</div>

      <h2>2. 누구에게 보낼까요?</h2>
      <div class="choices">${targets.map(([k, t]) =>
        `<button type="button" class="choice wide ${d.target === k ? 'on' : ''}" data-action="w-target" data-v="${k}"><b>${t.label}</b><small>${t.desc}</small></button>`).join('')}</div>

      <h2>3. 편지 쓰기</h2>
      <div class="write-box">
        <textarea id="w-body" maxlength="2000" rows="9" placeholder="${esc(prompt)}">${esc(d.body)}</textarea>
        <div class="write-tools">
          <button type="button" class="link-btn" id="mic" data-action="mic" hidden>🎤 말로 쓰기</button>
          <span class="small muted" id="w-count">${d.body.length} / 2000</span>
        </div>
      </div>
      <p class="small muted">연락처·링크·SNS 아이디는 자동으로 가려져요. 받는 분은 내 나이대만 알 수 있어요.</p>
      <label class="consent"><input type="checkbox" id="w-share" ${d.share ? 'checked' : ''}> 답장과 함께 <b>'오늘의 편지'</b>에 익명으로 소개돼도 좋아요 <span class="muted">(선택)</span></label>
      <button type="button" class="btn primary block" data-action="w-send">📮 우체통에 넣기</button>
    </section>`);
    setupMic($('#w-body'));
  }

  async function sendLetter(force) {
    const d = state.draft;
    d.body = ($('#w-body') || {}).value || d.body;
    if (!d.topic) return toast('어떤 고민인지 골라 주세요.');
    if (!d.target) return toast('누구에게 보낼지 골라 주세요.');
    if (d.body.trim().length < 10) return toast('조금만 더 적어 주세요. (10자 이상)');
    if (!force && CRISIS_RE.test(d.body)) return showCrisis();
    try {
      const shareBox = $('#w-share');
      const l = await api.sendLetter({ topic: d.topic, target: d.target, body: d.body.trim(), share_ok: !!(shareBox && shareBox.checked) });
      state.draft = { topic: null, target: null, body: '' };
      closeModal();
      if (l.status !== 'held') window.NaiteScene.burst();
      viewSent(l.status === 'held');
    } catch (e) { closeModal(); toast(errMsg(e)); }
  }

  function showCrisis() {
    openModal(`<h2>🌿 마음이 많이 무거우셨군요</h2>
      <p>여기까지 털어놓아 주셔서 고마워요. 편지는 운영자가 먼저 정성껏 읽고 전해 드릴게요.</p>
      <p class="small muted">답장을 기다리기 힘들 만큼 지금 이야기를 나누고 싶다면, 언제든 전화로 들어 줄 분이 있어요. <a href="tel:109">마음 상담 전화 연결</a> (무료·비밀 보장)</p>
      <button type="button" class="btn primary block" data-action="crisis-send">편지 보내기</button>
      <button type="button" class="link-btn block" data-action="modal-close">조금 더 고쳐 쓸게요</button>`);
  }

  function viewSent(held) {
    render(`<section class="center pad">
      <div class="post-anim" aria-hidden="true"><span class="env">✉️</span><span class="box">📮</span></div>
      <h2>편지를 넣었어요</h2>
      ${held
        ? '<p>이 편지는 운영자가 먼저 정성껏 읽고 전해 드릴게요.<br>답장이 오는 동안 따뜻한 차 한 잔 하며 쉬어 가세요 🍵</p>'
        : '<p>다른 세대의 누군가에게 배달되고 있어요.<br>답장이 도착하면 <b>내 편지함</b>에서 볼 수 있어요.</p>'}
      <div class="stack">
        <a class="btn primary block" href="#answer">기다리는 동안 남의 고민에 답장하기</a>
        <a class="btn block" href="#home">처음으로</a>
      </div>
    </section>`);
  }

  // ------------------------------------------------------------------
  // 화면: 답장 쓰기
  // ------------------------------------------------------------------
  async function viewAnswer() {
    loading('편지를 꺼내는 중…');
    let l;
    try { l = await api.claimLetter(); } catch (e) { return render(`<p class="center pad">${esc(errMsg(e))}</p>`); }
    state.claimed = l;
    if (!l) {
      return render(`<section class="center pad">
        <div class="hero-icon" aria-hidden="true">📭</div>
        <h2>지금은 기다리는 편지가 없어요</h2>
        <p class="muted">조금 뒤에 다시 와 주세요. 그동안 내 고민을 보내 보는 건 어때요?</p>
        <a class="btn primary block" href="#write">고민 보내기</a>
      </section>`);
    }
    const draft = store.get('naite_reply_draft_' + l.id, '');
    const sampleNote = l.is_sample
      ? '<p class="sample-note">🌱 나이테 우체국이 준비한 <b>연습 편지</b>예요. 실제 고민 편지가 도착하기 전까지 답장을 연습해 볼 수 있어요. 연습 답장은 저장되지 않아요.</p>'
      : '';
    render(`<h1 class="page-title">✍️ 답장 쓰기</h1>
      <p class="page-sub">당신의 세대가 지나온 길이 누군가에겐 지도가 돼요.</p>
      ${sampleNote}${letterPaper({ who: l.is_sample ? `연습 편지 · ${AGE[l.author_age]}의 고민` : `${AGE[l.author_age]}의 편지`, topic: l.topic, date: l.is_sample ? '' : dateLabel(l.created_at), body: l.body, age: l.author_age })}
      <section class="card">
        <h2>답장 쓰기</h2>
        <ul class="tips">
          <li>판단보다 <b>공감</b>을 먼저 전해 주세요.</li>
          <li>내 세대의 경험을 나눠 주면 큰 힘이 돼요.</li>
          <li>연락처는 자동으로 가려져요. 따로 만나자는 말은 하지 말아 주세요.</li>
        </ul>
        <div class="write-box">
          <textarea id="r-body" maxlength="2000" rows="8" placeholder="따뜻한 한마디로 시작해 보세요.">${esc(draft)}</textarea>
          <div class="write-tools">
            <button type="button" class="link-btn" id="mic" data-action="mic" hidden>🎤 말로 쓰기</button>
            <span class="small muted" id="r-count">${draft.length} / 2000</span>
          </div>
        </div>
        ${l.is_sample ? '' : `<label class="consent"><input type="checkbox" id="r-share"> 고민 쓴 분도 동의하면 <b>'오늘의 편지'</b>에 익명으로 소개돼도 좋아요 <span class="muted">(선택)</span></label>`}
        <button type="button" class="btn primary block" data-action="r-send">✉️ 답장 보내기</button>
        <div class="row-between">
          <button type="button" class="link-btn" data-action="r-skip">다른 편지 받기</button>
          <button type="button" class="link-btn danger" data-action="r-report">신고하기</button>
        </div>
      </section>`);
    setupMic($('#r-body'));
  }

  async function sendReply() {
    const l = state.claimed; if (!l) return;
    const body = ($('#r-body').value || '').trim();
    if (body.length < 10) return toast('조금만 더 적어 주세요. (10자 이상)');
    try {
      if (l.is_sample) {
        await api.practiceReply(l.id);
        store.set('naite_reply_draft_' + l.id, '');
        state.claimed = null;
        return render(`<section class="center pad">
          <div class="hero-icon" aria-hidden="true">🌱</div>
          <h2>연습 답장을 마쳤어요</h2>
          <p>따뜻한 답장 고마워요. 실제 고민 편지가 도착하면 이렇게 답장해 주시면 돼요.</p>
          <div class="stack">
            <a class="btn primary block" href="#answer" data-action="again">다른 편지 받기</a>
            <a class="btn block" href="#write">내 고민 보내기</a>
          </div>
        </section>`);
      }
      if (!state.toneOk && Naite.toneCheck) {
        const issue = Naite.toneCheck(body);
        if (issue) { Naite.showToneModal(issue); return; }
      }
      state.toneOk = false;
      const rs = $('#r-share');
      await api.sendReply(l.id, body, !!(rs && rs.checked));
      window.NaiteScene.burst();
      store.set('naite_reply_draft_' + l.id, '');
      state.claimed = null;
      render(`<section class="center pad">
        <div class="post-anim" aria-hidden="true"><span class="env">✉️</span><span class="box">📮</span></div>
        <h2>답장을 보냈어요</h2>
        <p>${esc(AGE[l.author_age])}의 그분께 곧 도착해요.<br>고마워요 우표가 오면 <b>내 편지함</b>에서 볼 수 있어요.</p>
        <div class="stack">
          <a class="btn primary block" href="#answer" data-action="again">한 통 더 답장하기</a>
          <a class="btn block" href="#home">처음으로</a>
        </div>
      </section>`);
    } catch (e) { toast(errMsg(e)); }
  }

  // ------------------------------------------------------------------
  // 화면: 내 편지함
  // ------------------------------------------------------------------
  async function viewInbox() {
    loading();
    const tab = state.inboxTab;
    let body = '';
    try {
      if (tab === 'sent') {
        const list = await api.myLetters();
        body = list.length ? list.map(sentItem).join('') : empty('아직 보낸 고민이 없어요.', '#write', '고민 보내기');
        list.forEach((l) => { if (l.reply) seen.add(l.reply.id); });
        saveSeen();
      } else {
        const [list, stamps] = await Promise.all([api.myReplies(), api.stampsReceived()]);
        body = `<p class="stamp-count">받은 고마워요 우표 <b>${stamps}</b>장 💌</p>`
          + (list.length ? list.map(replyItem).join('') : empty('아직 쓴 답장이 없어요.', '#answer', '답장 쓰기'));
      }
    } catch (e) { body = `<p class="center pad">${esc(errMsg(e))}</p>`; }
    render(`<h1 class="page-title">📬 내 편지함</h1>
      <div class="inbox-tools"><a class="chip-link" href="#book">📖 내 편지 책</a><a class="chip-link" href="#notify">🔔 답장 알림</a><a class="chip-link" href="#account">🔐 편지함 지키기</a></div>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" class="tab ${tab === 'sent' ? 'on' : ''}" data-action="tab" data-v="sent">보낸 고민</button>
        <button type="button" role="tab" class="tab ${tab === 'replied' ? 'on' : ''}" data-action="tab" data-v="replied">내가 쓴 답장</button>
      </div>${body}`);
  }

  function empty(msg, href, label) {
    return `<section class="center pad"><p class="muted">${esc(msg)}</p><a class="btn primary" href="${href}">${esc(label)}</a></section>`;
  }

  function sentItem(l) {
    let status;
    if (l.status === 'held') status = '<p class="status">운영자가 먼저 읽고 있어요</p>';
    else if (l.reply) status = '';
    else if (l.status === 'answered') status = '<p class="status">✉️ 답장이 오고 있어요 · 곧 도착해요</p>';
    else status = '<p class="status">📮 답장해 줄 분을 기다리고 있어요</p>';

    const reply = l.reply ? `${letterPaper({ who: `${AGE[l.reply.author_age]}의 답장`, date: dateLabel(l.reply.deliver_at), body: l.reply.body, cls: 'reply', age: l.reply.author_age })}
      <div class="row-between">
        ${l.reply.thanked
          ? '<span class="small">💌 고마워요 우표를 보냈어요</span>'
          : `<button type="button" class="btn small primary" data-action="thank" data-v="${l.reply.id}">💌 고마워요 우표 보내기</button>`}
        <button type="button" class="btn small" data-action="share-card" data-v="${l.reply.id}">📸 답장 카드</button>
        <button type="button" class="link-btn danger" data-action="report-reply" data-v="${l.reply.id}">신고</button>
      </div>` : '';

    return `<div class="thread">
      ${letterPaper({ who: `내 고민 · ${TARGETS[l.target].label}`, topic: l.topic, date: dateLabel(l.created_at), body: l.body, cls: 'mine' })}
      ${status}${reply}
    </div>`;
  }

  function replyItem(r) {
    const l = r.letter || {};
    return `<div class="thread">
      ${letterPaper({ who: `${AGE[l.author_age] || ''}의 편지`, topic: l.topic, body: l.body || '', cls: 'mine', age: l.author_age })}
      ${letterPaper({ who: '내가 쓴 답장', date: dateLabel(r.created_at), body: r.body, cls: 'reply' })}
      <p class="status">${r.thanked ? '💌 고마워요 우표를 받았어요' : '답장을 전했어요'}</p>
    </div>`;
  }

  // ------------------------------------------------------------------
  // 화면: 나이대 바꾸기
  // ------------------------------------------------------------------
  function viewProfile() {
    state.ob = { age: state.profile.age_group, gender: state.profile.gender || null };
    viewOnboarding();
  }

  // ------------------------------------------------------------------
  // 음성 입력 (지원 브라우저만)
  // ------------------------------------------------------------------
  function setupMic(textarea) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = $('#mic');
    if (!SR || !btn || !textarea) return;
    btn.hidden = false;
    btn.onclick = () => {
      const rec = new SR();
      rec.lang = 'ko-KR'; rec.interimResults = false; rec.maxAlternatives = 1;
      btn.textContent = '🎙️ 듣고 있어요…'; btn.disabled = true;
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        textarea.value += (textarea.value && !/\s$/.test(textarea.value) ? ' ' : '') + text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      };
      rec.onend = () => { btn.textContent = '🎤 말로 쓰기'; btn.disabled = false; };
      rec.onerror = () => toast('음성을 알아듣지 못했어요. 다시 시도해 주세요.');
      rec.start();
    };
  }

  // ------------------------------------------------------------------
  // 이벤트
  // ------------------------------------------------------------------
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action; const v = el.dataset.v;
    switch (a) {
      case 'ob-age': state.ob.age = +v; updateOb(); break;
      case 'ob-gender': state.ob.gender = state.ob.gender === v ? null : v; updateOb(); break;
      case 'ob-save':
        if (!state.ob.age) return;
        el.disabled = true;
        try {
          state.profile = await api.saveProfile({ age_group: state.ob.age, gender: state.ob.gender });
          location.hash = '#home'; route();
        } catch (e) { el.disabled = false; toast(errMsg(e)); }
        break;
      case 'w-topic': state.draft.body = $('#w-body').value; state.draft.topic = v; viewWrite(); break;
      case 'w-target': state.draft.body = $('#w-body').value; state.draft.target = v; viewWrite(); break;
      case 'w-send': el.disabled = true; await sendLetter(false); el.disabled = false; break;
      case 'crisis-send': el.disabled = true; await sendLetter(true); break;
      case 'modal-close': closeModal(); break;
      case 'r-send': el.disabled = true; await sendReply(); el.disabled = false; break;
      case 'r-skip':
        if (state.claimed) { try { await api.skipLetter(state.claimed.id); } catch (e) { return toast(errMsg(e)); } }
        viewAnswer(); break;
      case 'r-report':
        if (!state.claimed || !confirm('이 편지를 신고할까요? 신고한 편지는 다시 오지 않아요.')) return;
        try {
          await api.report('letter', state.claimed.id, 'inappropriate');
          await api.skipLetter(state.claimed.id);
          toast('신고했어요. 운영자가 확인할게요.');
          viewAnswer();
        } catch (e) { toast(errMsg(e)); }
        break;
      case 'again': ev.preventDefault(); viewAnswer(); break;
      case 'tab': state.inboxTab = v; viewInbox(); break;
      case 'thank':
        el.disabled = true;
        try { await api.thank(v); toast('고마워요 우표를 보냈어요 💌'); viewInbox(); }
        catch (e) { el.disabled = false; toast(errMsg(e)); }
        break;
      case 'report-reply':
        if (!confirm('이 답장을 신고할까요?')) return;
        try { await api.report('reply', v, 'inappropriate'); toast('신고했어요. 운영자가 확인할게요.'); }
        catch (e) { toast(errMsg(e)); }
        break;
      default: break;
    }
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'w-body') { state.draft.body = t.value; const c = $('#w-count'); if (c) c.textContent = `${t.value.length} / 2000`; }
    if (t.id === 'w-share') state.draft.share = t.checked;
    if (t.id === 'r-body') {
      const c = $('#r-count'); if (c) c.textContent = `${t.value.length} / 2000`;
      if (state.claimed) store.set('naite_reply_draft_' + state.claimed.id, t.value);
    }
  });

  $('#modal').addEventListener('click', (ev) => { if (ev.target.id === 'modal') closeModal(); });

  // 글씨 크게
  const fontBtn = $('#font-toggle');
  function applyFont(big) {
    document.documentElement.classList.toggle('big-text', big);
    fontBtn.setAttribute('aria-pressed', String(big));
    fontBtn.textContent = big ? '글씨 보통' : '글씨 크게';
  }
  applyFont(store.get('naite_big_text', false));
  fontBtn.addEventListener('click', () => {
    const big = !document.documentElement.classList.contains('big-text');
    store.set('naite_big_text', big); applyFont(big);
  });

  // ------------------------------------------------------------------
  // 라우터
  // ------------------------------------------------------------------
  // 스크롤하면 3D 배경을 은은하게 (글 읽기 편하게)
  window.addEventListener('scroll', () => {
    document.documentElement.classList.toggle('scrolled', window.scrollY > 260);
  }, { passive: true });

  // 메뉴 카드 입체 기울기 (마우스)
  document.addEventListener('pointermove', (ev) => {
    const card = ev.target.closest && ev.target.closest('.tilt');
    document.querySelectorAll('.tilt').forEach((c) => {
      if (c !== card) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); }
    });
    if (!card || ev.pointerType === 'touch') return;
    const r = card.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width; const y = (ev.clientY - r.top) / r.height;
    card.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
    card.style.setProperty('--rx', `${(0.5 - y) * 12}deg`);
    card.style.setProperty('--mx', `${x * 100}%`);
    card.style.setProperty('--my', `${y * 100}%`);
  }, { passive: true });

  function route() {
    closeModal();
    const h = (location.hash || '#home').slice(1);
    const isHome = !state.profile || h === 'home' || h === '';
    window.NaiteScene.setMode(isHome ? 'home' : 'page');
    if (Naite.publicViews[h]) { window.NaiteScene.setMode('page'); return Naite.publicViews[h](); }
    if (!state.profile) return viewOnboarding();
    if (Naite.views[h]) return Naite.views[h]();
    if (h === 'write') return viewWrite();
    if (h === 'answer') return viewAnswer();
    if (h === 'inbox') return viewInbox();
    if (h === 'profile') return viewProfile();
    return viewHome();
  }
  window.addEventListener('hashchange', route);

  (async function boot() {
    if (api.mode === 'demo') $('#demo-banner').hidden = false;
    try { state.profile = await api.init(); }
    catch (e) { return render(`<p class="center pad">${esc(errMsg(e))}</p>`); }
    for (const h of Naite.bootHooks) { try { await h(); } catch (e) { console.error(e); } }
    route();
  })();
})();

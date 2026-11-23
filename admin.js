/* 나이테 우체국 운영실 — 위기 편지 확인, 신고 처리, 오늘의 편지, 세대 질문, 기관 우체통 */
(function () {
  'use strict';
  const CFG = window.NAITE_CONFIG || {};
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { storageKey: 'naite-admin' } });
  const AGE = { 1: '10대', 2: '20대', 3: '30대', 4: '40대', 5: '50대', 6: '60대 이상' };
  const TOPICS = { family: '가족', work: '일·진로', love: '연애·결혼', money: '돈', health: '건강', lonely: '외로움', etc: '그 밖의 고민' };
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200); }
  async function rpc(name, args) { const { data, error } = await sb.rpc(name, args || {}); if (error) throw error; return data; }

  const lastEmail = () => { try { return localStorage.getItem('naite-admin-email') || ''; } catch (e) { return ''; } };
  function viewLogin(msg) {
    const em = lastEmail();
    app.innerHTML = `<section class="panel login"><h2>🔐 운영자 로그인</h2>
      ${msg ? `<p class="meta">${esc(msg)}</p>` : ''}
      <form id="login-form">
        <label>이메일</label><input id="em" type="email" autocomplete="username" value="${esc(em)}">
        <label>비밀번호</label><input id="pw" type="password" autocomplete="current-password">
        <p><button class="amber" type="submit">로그인</button></p>
      </form>
      <p class="meta">한 번 로그인하면 로그아웃하기 전까지 이 브라우저에서는 다시 묻지 않아요.</p>
      <p class="meta">운영자 계정은 Supabase 대시보드 → Authentication → Users → Add user 에서 만들고, 운영자 목록(admins)에 이메일이 등록돼 있어야 해요.</p></section>`;
    // 이메일이 기억돼 있으면 비밀번호 칸으로 바로
    const box = document.getElementById(em ? 'pw' : 'em');
    if (box) box.focus();
  }

  async function load() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session || session.user.is_anonymous) return viewLogin();
    document.getElementById('who').innerHTML = `${esc(session.user.email)} · <button data-a="pw">비밀번호 바꾸기</button> <button data-a="logout">로그아웃</button>`;
    if (!(await rpc('is_admin'))) return viewLogin('이 계정은 운영자 목록에 없어요.');
    const o = await rpc('admin_overview');
    const c = o.counts;
    app.innerHTML = `
      <section class="panel"><div class="stats">
        <div class="stat"><b>${c.users}</b><span>이용자</span></div>
        <div class="stat"><b>${c.letters}</b><span>편지</span></div>
        <div class="stat"><b>${c.replies}</b><span>답장</span></div>
        <div class="stat"><b>${c.waiting}</b><span>답장 기다리는 편지</span></div>
        <div class="stat ${c.held ? 'alert' : ''}"><b>${c.held}</b><span>먼저 읽을 편지</span></div>
        <div class="stat ${c.reports ? 'alert' : ''}"><b>${c.reports}</b><span>처리할 신고</span></div>
        <div class="stat"><b>${c.push}</b><span>알림 구독</span></div>
      </div></section>

      <div class="grid2">
        <section class="panel"><h2>🌿 먼저 읽을 편지 <span class="badge">${o.held.length}</span></h2>
          ${o.held.length ? o.held.map((l) => `<div class="item">
            <div class="meta">${AGE[l.author_age]} · ${TOPICS[l.topic] || ''} · ${when(l.created_at)}</div>
            <div class="body">${esc(l.body)}</div>
            <div class="row"><button class="ok" data-a="release" data-id="${l.id}">확인했어요, 배달하기</button>
              <button data-a="close" data-id="${l.id}">배달하지 않기</button>
              <button class="warn" data-a="block" data-id="${l.author_id}">작성자 이용 제한</button></div></div>`).join('') : '<p class="empty">없어요 🙂</p>'}
          ${o.held_answers.length ? `<h2 style="margin-top:18px">세대 질문 보류 답변</h2>${o.held_answers.map((a) => `<div class="item">
            <div class="meta">${AGE[a.age_group]} · ${when(a.created_at)}</div><div class="body">${esc(a.body)}</div>
            <div class="row"><button class="ok" data-a="ans-show" data-id="${a.id}">공개</button><button data-a="ans-hide" data-id="${a.id}">숨김</button></div></div>`).join('')}` : ''}
        </section>

        <section class="panel"><h2>🚩 신고 <span class="badge">${o.reports.length}</span></h2>
          ${o.reports.length ? o.reports.map((r) => `<div class="item">
            <div class="meta">${r.target_type === 'letter' ? '편지' : '답장'} · ${esc(r.reason || '')} · ${when(r.created_at)}</div>
            <div class="body">${esc(r.body || '(삭제됨)')}</div>
            <div class="row">
              ${r.target_type === 'reply' ? `<button class="warn" data-a="hide-reply" data-id="${r.target_id}">답장 숨기기</button>` : `<button class="warn" data-a="close" data-id="${r.target_id}">편지 배달 중단</button>`}
              ${r.author_id ? `<button class="warn" data-a="block" data-id="${r.author_id}">작성자 이용 제한</button>` : ''}
              <button class="ok" data-a="resolve" data-id="${r.id}">처리 완료</button></div></div>`).join('') : '<p class="empty">없어요 🙂</p>'}
        </section>
      </div>

      <section class="panel"><h2>📰 오늘의 편지 고르기</h2>
        <p class="meta">양쪽 모두 공개에 동의한 편지만 보여요. 지정하지 않으면 매일 자동으로 한 통이 골라져요.</p>
        <div class="row"><label style="margin:0">날짜</label><input id="fday" type="date" value="${today()}" style="width:auto"></div>
        ${o.shareable.length ? `<table><tr><th>고민</th><th>답장</th><th></th></tr>${o.shareable.map((s) => `<tr>
          <td>${AGE[s.author_age]} · ${esc(s.body)}…</td><td>${AGE[s.reply_age]} · ${esc(s.reply_body)}…</td>
          <td><button class="amber" data-a="feature" data-id="${s.id}">이 날 소개</button>${s.featured_day ? `<div class="meta">${s.featured_day} 소개됨</div>` : ''}</td></tr>`).join('')}</table>` : '<p class="empty">아직 공개 동의된 편지가 없어요.</p>'}
      </section>

      <div class="grid2">
        <section class="panel"><h2>🗣️ 세대 질문</h2>
          <label>새 질문</label><input id="qbody" maxlength="200" placeholder="예: 스무 살의 나에게 해 주고 싶은 말은?">
          <div class="row"><div><label>시작</label><input id="qs" type="date" value="${today()}"></div><div><label>끝</label><input id="qe" type="date"></div></div>
          <p><button class="amber" data-a="q-save">질문 등록</button></p>
          <table><tr><th>질문</th><th>기간</th><th>답</th><th></th></tr>${o.questions.map((q) => `<tr><td>${esc(q.body)}</td><td>${q.starts_on}~${q.ends_on}</td><td>${q.answers}</td><td><button data-a="q-answers" data-id="${q.id}">답 보기</button></td></tr>`).join('')}</table>
          <div id="qans"></div>
        </section>

        <section class="panel"><h2>🏢 기관 전용 우체통</h2>
          <label>기관 이름</label><input id="oname" placeholder="예: 행복동 노인복지관">
          <div class="row"><div><label>주소용 이름(영문)</label><input id="oslug" placeholder="happy-welfare"></div><div><label>우체통 코드</label><input id="ocode" placeholder="HAPPY2026"></div></div>
          <p><button class="amber" data-a="org-save">저장</button></p>
          <table><tr><th>기관</th><th>코드</th><th>인원</th><th>편지</th><th>초대 링크</th></tr>${o.orgs.map((g) => `<tr>
            <td>${esc(g.name)}${g.is_active ? '' : ' (중지)'}</td><td>${esc(g.join_code || '')}</td><td>${g.members}</td><td>${g.letters}</td>
            <td><button data-a="copy" data-v="${esc((CFG.siteUrl || '') + '?org=' + (g.join_code || ''))}">복사</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">아직 없어요</td></tr>'}</table>
        </section>
      </div>`;
  }

  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a; const id = b.dataset.id;
    try {
      switch (a) {
        case 'logout': await sb.auth.signOut(); document.getElementById('who').textContent = ''; return viewLogin();
        case 'pw': {
          const p1 = prompt('새 비밀번호 (10자 이상)'); if (!p1) return;
          if (p1.length < 10) return toast('10자 이상으로 정해 주세요');
          if (prompt('한 번 더 입력해 주세요') !== p1) return toast('두 비밀번호가 달라요');
          const { error } = await sb.auth.updateUser({ password: p1 });
          if (error) throw error;
          return toast('비밀번호를 바꿨어요');
        }
        case 'release': await rpc('admin_letter', { p_id: id, p_action: 'release' }); toast('배달을 시작했어요'); break;
        case 'close': if (!confirm('이 편지를 배달하지 않을까요?')) return; await rpc('admin_letter', { p_id: id, p_action: 'close' }); toast('배달을 멈췄어요'); break;
        case 'block': if (!confirm('이 이용자의 이용을 제한할까요?')) return; await rpc('admin_block', { p_user: id, p_blocked: true }); toast('이용을 제한했어요'); break;
        case 'hide-reply': await rpc('admin_hide_reply', { p_id: id, p_hidden: true }); toast('답장을 숨겼어요'); break;
        case 'resolve': await rpc('admin_resolve_report', { p_id: id }); toast('처리 완료'); break;
        case 'ans-show': await rpc('admin_answer', { p_id: id, p_status: 'visible' }); toast('공개했어요'); break;
        case 'ans-hide': await rpc('admin_answer', { p_id: id, p_status: 'hidden' }); toast('숨겼어요'); break;
        case 'feature': await rpc('admin_feature', { p_day: document.getElementById('fday').value, p_letter: id }); toast('오늘의 편지로 지정했어요'); break;
        case 'q-save': {
          const body = document.getElementById('qbody').value.trim(); const s = document.getElementById('qs').value; const e = document.getElementById('qe').value;
          if (!body || !s || !e) return toast('질문과 기간을 입력해 주세요');
          await rpc('admin_save_question', { p_body: body, p_starts: s, p_ends: e }); toast('질문을 등록했어요'); break;
        }
        case 'q-answers': {
          const list = await rpc('admin_question_answers', { p_q: id });
          document.getElementById('qans').innerHTML = `<h2 style="margin-top:14px">답변 ${list.length}개</h2>` + list.map((x) => `<div class="item">
            <div class="meta">${AGE[x.age_group]} · ${x.status} · ${when(x.created_at)}</div><div class="body">${esc(x.body)}</div>
            <div class="row"><button data-a="ans-hide" data-id="${x.id}">숨김</button><button class="ok" data-a="ans-show" data-id="${x.id}">공개</button></div></div>`).join('');
          return;
        }
        case 'org-save': {
          const name = document.getElementById('oname').value.trim(); const slug = document.getElementById('oslug').value.trim(); const code = document.getElementById('ocode').value.trim();
          if (!name || !slug || !code) return toast('세 칸을 모두 입력해 주세요');
          await rpc('admin_save_org', { p_name: name, p_slug: slug, p_code: code, p_active: true }); toast('저장했어요'); break;
        }
        case 'copy': await navigator.clipboard.writeText(b.dataset.v); toast('초대 링크를 복사했어요'); return;
        default: return;
      }
      load();
    } catch (e) { console.error(e); toast('오류: ' + (e.message || e)); }
  });

  // 로그인 (엔터로도 됨). 이메일은 이 브라우저에 기억해 두고 다음엔 비밀번호만 입력
  document.addEventListener('submit', async (ev) => {
    if (ev.target.id !== 'login-form') return;
    ev.preventDefault();
    const email = document.getElementById('em').value.trim();
    const { error } = await sb.auth.signInWithPassword({ email, password: document.getElementById('pw').value });
    if (error) return viewLogin('로그인 정보를 확인해 주세요.');
    try { localStorage.setItem('naite-admin-email', email); } catch (e) { /* 저장 불가 */ }
    load();
  });

  load();
})();

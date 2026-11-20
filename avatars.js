/* 나이테 우체국 — 나이대별 우체부 캐릭터 (오리지널 SVG 일러스트)
 * window.NaiteAvatar(age 1~6, gender 'f'|'m'|'x'|null) → SVG 문자열
 */
(function () {
  'use strict';
  const SKIN = ['#ffdcc0', '#ffd5b3', '#f6c9a2', '#f2c398', '#ecb98c', '#f1c7a3'];
  const HAIR = { 1: '#2b1d16', 2: '#3d2a1e', 3: '#4a3022', 4: '#3a2a20', 5: '#7a716a', 6: '#e4e0da' };
  const BG = { 1: ['#7fd6ff', '#3c8dff'], 2: ['#ffd36b', '#ff8c42'], 3: ['#9cf0c8', '#2fae7a'], 4: ['#ffb3c7', '#e0567f'], 5: ['#c9b6ff', '#7b5cff'], 6: ['#ffe2a8', '#e0a03c'] };
  const SHIRT = { 1: '#2f6bff', 2: '#ff7a45', 3: '#2fae7a', 4: '#41506b', 5: '#7b5cff', 6: '#c8412d' };
  let uid = 0;

  function hairBack(g, c) {
    if (g === 'f') return `<path d="M29 54 Q27 20 60 19 Q93 20 91 54 L95 98 Q78 106 60 104 Q42 106 25 98Z" fill="${c}"/>`;
    if (g === 'x') return `<path d="M31 54 Q30 22 60 21 Q90 22 89 54 L90 80 Q60 88 30 80Z" fill="${c}"/>`;
    return '';
  }
  function hairFront(age, g, c) {
    if (age === 6 && g !== 'f') { // 희끗한 짧은 머리 + 살짝 넓은 이마
      return `<path d="M33 52 Q33 34 44 31 Q40 40 42 46 M87 52 Q87 34 76 31 Q80 40 78 46" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>
              <path d="M44 30 Q60 24 76 30" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
    }
    if (g === 'f') return `<path d="M33 52 Q34 27 60 26 Q88 27 87 52 Q80 40 66 38 Q58 46 44 44 Q37 46 33 52Z" fill="${c}"/>`;
    if (g === 'x') return `<path d="M33 50 Q34 26 60 25 Q86 26 87 50 Q72 38 58 41 Q44 38 33 50Z" fill="${c}"/>`;
    return `<path d="M33 50 Q33 27 60 26 Q87 27 87 50 Q84 40 74 37 Q66 42 56 38 Q44 36 36 46Z" fill="${c}"/>`;
  }
  function accessory(age, id) {
    switch (age) {
      case 1: // 헤드폰
        return `<path d="M30 54 Q30 18 60 18 Q90 18 90 54" fill="none" stroke="#1d2b4f" stroke-width="5"/>
                <rect x="23" y="48" width="12" height="18" rx="5" fill="#ff4d6d"/><rect x="85" y="48" width="12" height="18" rx="5" fill="#ff4d6d"/>`;
      case 2: // 거꾸로 쓴 캡모자
        return `<path d="M32 42 Q34 20 60 20 Q86 20 88 42 Q60 34 32 42Z" fill="#1f2a44"/>
                <rect x="78" y="36" width="20" height="7" rx="3.5" fill="#1f2a44" transform="rotate(12 88 40)"/>
                <circle cx="60" cy="21" r="2.5" fill="#ffd36b"/>`;
      case 3: // 동그란 안경
        return `<g fill="none" stroke="#2a211b" stroke-width="2.4"><circle cx="49" cy="58" r="8"/><circle cx="71" cy="58" r="8"/><path d="M57 58 L63 58"/></g>`;
      case 4: // 넥타이 + 셔츠 칼라
        return `<path d="M50 90 L60 98 L70 90" fill="#fff"/><path d="M57 96 L63 96 L65 118 L60 122 L55 118Z" fill="#e0482f"/>`;
      case 5: // 페도라
        return `<ellipse cx="60" cy="33" rx="34" ry="6" fill="#4b3a2a"/><path d="M40 33 Q41 14 60 14 Q79 14 80 33Z" fill="#5d4733"/><rect x="40" y="27" width="40" height="5" fill="#2a1f16"/>`;
      case 6: // 반달 돋보기 안경 + 주름
        return `<g fill="none" stroke="#7a5a2a" stroke-width="2.2"><path d="M41 60 Q49 67 57 60 Z"/><path d="M63 60 Q71 67 79 60 Z"/><path d="M57 60 L63 60"/></g>
                <path d="M40 52 Q44 50 48 52 M72 52 Q76 50 80 52" stroke="#c99a74" stroke-width="1.6" fill="none"/>`;
      default: return '';
    }
  }

  window.NaiteAvatar = function (age, gender, opts) {
    const a = Math.min(6, Math.max(1, +age || 3));
    const g = gender || 'x';
    const id = 'av' + (++uid);
    const [b1, b2] = BG[a];
    const skin = SKIN[a - 1];
    const hair = HAIR[a];
    const smile = a >= 5 ? 'M50 69 Q60 79 70 69' : 'M52 69 Q60 76 68 69';
    const eyeY = a === 6 ? 59 : 58;
    const eyes = a === 6
      ? `<path d="M45 ${eyeY} Q49 55 53 ${eyeY}" stroke="#2a211b" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M67 ${eyeY} Q71 55 75 ${eyeY}" stroke="#2a211b" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
      : `<circle cx="49" cy="${eyeY}" r="3.6" fill="#2a211b"/><circle cx="71" cy="${eyeY}" r="3.6" fill="#2a211b"/><circle cx="50.2" cy="${eyeY - 1.3}" r="1.2" fill="#fff"/><circle cx="72.2" cy="${eyeY - 1.3}" r="1.2" fill="#fff"/>`;
    const lashes = g === 'f' && a !== 6 ? `<path d="M44 54 L46 55.5 M76 54 L74 55.5" stroke="#2a211b" stroke-width="1.8" stroke-linecap="round"/>` : '';
    const beard = g === 'm' && (a === 4 || a === 5) ? `<path d="M44 70 Q60 88 76 70 Q72 84 60 85 Q48 84 44 70Z" fill="${hair}" opacity=".55"/>` : '';
    const label = opts && opts.title ? `<title>${opts.title}</title>` : '';
    return `<svg viewBox="0 0 120 120" class="avatar-svg" role="img" aria-label="${(opts && opts.title) || '캐릭터'}">${label}
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient>
      <clipPath id="${id}c"><circle cx="60" cy="60" r="58"/></clipPath></defs>
      <circle cx="60" cy="60" r="58" fill="url(#${id})"/>
      <g clip-path="url(#${id}c)">
        <circle cx="24" cy="24" r="10" fill="#fff" opacity=".18"/><circle cx="98" cy="30" r="6" fill="#fff" opacity=".22"/>
        ${hairBack(g, hair)}
        <path d="M18 124 Q18 90 60 89 Q102 90 102 124Z" fill="${SHIRT[a]}"/>
        <path d="M52 80 L68 80 L67 92 Q60 96 53 92Z" fill="${skin}"/>
        <path d="M14 112 Q20 104 30 104 L30 124 L14 124Z" fill="#fff6e6" opacity=".95"/>
        <rect x="16" y="106" width="12" height="8" rx="1" fill="#e0482f" opacity=".8"/>
        <circle cx="34" cy="60" r="5.5" fill="${skin}"/><circle cx="86" cy="60" r="5.5" fill="${skin}"/>
        <circle cx="60" cy="57" r="27" fill="${skin}"/>
        ${beard}
        ${hairFront(a, g, hair)}
        ${eyes}${lashes}
        <ellipse cx="42" cy="67" rx="5" ry="3" fill="#ff8a8a" opacity=".45"/><ellipse cx="78" cy="67" rx="5" ry="3" fill="#ff8a8a" opacity=".45"/>
        <path d="M58 62 Q60 66 62 62" stroke="#c98b66" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="${smile}" stroke="#2a211b" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        ${accessory(a, id)}
      </g>
      <circle cx="60" cy="60" r="57" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
    </svg>`;
  };
})();

// 나이테 우체국 설정
// Supabase 주소와 publishable 키를 넣으면 실제 서비스 모드로 동작합니다.
// 비워 두면 이 브라우저 안에서만 돌아가는 '데모 모드'로 동작합니다.
//
// ▶ 데모 모드로 돌리려면 아래 두 값을 '' 로 비우세요.
//   (publishable 키는 브라우저에 공개돼도 되는 키입니다. 데이터는 RLS 권한으로 보호됩니다.)
window.NAITE_CONFIG = {
  supabaseUrl: 'https://hxplsvnuolkxarkbpafa.supabase.co',
  supabaseAnonKey: 'sb_publishable_XNZlBtPv_lvnmRGW4VaPbQ_FDmHSdBN',
  siteUrl: 'https://nahk227.github.io/naite-post/',

  // ▼ 운영자가 채울 값 (비어 있으면 해당 기능은 '준비 중'으로 표시)
  operatorName: '',     // 약관·개인정보처리방침에 표시할 운영자(사업자) 이름
  contactEmail: '',     // 문의·편지 책 주문·기관 도입 문의 이메일
  donateUrl: '',        // 후원 페이지 주소 (예: 토스 후원 링크)
  kakaoLogin: false,    // Supabase에 카카오 로그인을 설정한 뒤 true 로
  policyDate: '2026년 11월 20일',

  // 데모 모드에서 내 고민에 데모 답장이 도착하기까지 걸리는 시간(초)
  demoReplyDelaySec: 20,
};

// 나이테 우체국 설정
// Supabase 주소와 publishable 키를 넣으면 실제 서비스 모드로 동작합니다.
// 비워 두면 이 브라우저 안에서만 돌아가는 '데모 모드'로 동작합니다.
//
// ▶ 데모 모드로 돌리려면 아래 두 값을 '' 로 비우세요.
//   (publishable 키는 브라우저에 공개돼도 되는 키입니다. 데이터는 RLS 권한으로 보호됩니다.)
window.NAITE_CONFIG = {
  supabaseUrl: 'https://hxplsvnuolkxarkbpafa.supabase.co',
  supabaseAnonKey: 'sb_publishable_XNZlBtPv_lvnmRGW4VaPbQ_FDmHSdBN',
  // 데모 모드에서 내 고민에 데모 답장이 도착하기까지 걸리는 시간(초)
  demoReplyDelaySec: 20,
};

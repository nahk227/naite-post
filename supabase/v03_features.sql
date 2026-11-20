-- =====================================================================
-- 나이테 우체국 v0.3 — 확장 기능 (2026-11-20 적용 완료, 기록용)
-- schema.sql(v0.2) 다음에 적용. 실제 적용은 아래 순서의 마이그레이션으로 나눠서 했음:
--   naite_v03_tables → naite_v03_functions → naite_v03_grants → naite_v03_ext
--   → naite_v03_push_config → naite_v03_push_mark2 → naite_v03_cron
-- 원칙: 편지 한 통 = 답장 한 통. 이용자끼리 다시 연결되거나 연락할 수 있는 기능은 두지 않음.
-- =====================================================================

-- [tables] 공개 동의·숨김·알림 기록·신고 처리·기관 코드
alter table public.letters add column if not exists share_ok boolean not null default false;
alter table public.replies add column if not exists share_ok boolean not null default false;
alter table public.replies add column if not exists hidden boolean not null default false;
alter table public.replies add column if not exists notified_at timestamptz;
alter table public.reports add column if not exists resolved boolean not null default false;
alter table public.orgs add column if not exists join_code text unique;
alter table public.orgs add column if not exists is_active boolean not null default true;
-- featured(오늘의 편지 지정), questions/answers(세대 질문), push_subs(웹 푸시 구독, dead 표시),
-- admins(운영자 이메일), push_config(VAPID 키·cron 토큰, 서비스 롤 전용) — 모두 RLS 켬, 직접 접근 권한 없음

-- [functions] 이용자용 RPC
--   my_rings()            내 나이테 (보낸 고민·쓴 답장·연습·세대 질문·받은 우표)
--   today_letter()        양쪽 모두 공개 동의한 편지 1통 (운영자 지정 우선, 없으면 날짜별 무작위), 익명
--   current_question()    이번 주 세대 질문 + 세대별 인원·최근 답 4개 (보류·숨김 제외)
--   set_share(kind,id,ok) 내 편지/답장의 공개 동의 변경
--   save_push / remove_push  알림 구독 저장·해지(해지는 dead 표시)
--   join_org / leave_org / my_org  기관 전용 우체통 (같은 기관끼리만 배달, 연습 편지는 공통)
--   claim_letter()        (변경) 연습 편지는 기관과 상관없이 배달
-- [functions] 운영자용 RPC (is_admin() 확인: 익명 아님 + admins 테이블에 이메일 등록)
--   admin_overview, admin_letter(release/close), admin_hide_reply, admin_answer,
--   admin_block, admin_resolve_report, admin_feature, admin_save_org,
--   admin_save_question, admin_question_answers
-- [functions] 서비스 롤 전용 (Edge Function send-push)
--   push_internal_config, push_set_keys, push_due, push_mark

-- [trigger] answers: 프로필 필수·기간 확인·연락처 가림·위기 표현이면 held
-- [policy]  replies_hidden_guard (restrictive): 운영자가 숨긴 답장은 고민 작성자에게 안 보임
-- [policy]  answers: 내 답만 직접 조회, 쓰기는 question_id·body만

-- [cron] 5분마다 Edge Function 'send-push' 호출 (x-cron-token 헤더는 push_config에서 실행 시 읽음)
-- select cron.schedule('naite-send-push', '*/5 * * * *', $job$
--   select net.http_post(
--     url := 'https://hxplsvnuolkxarkbpafa.supabase.co/functions/v1/send-push',
--     headers := jsonb_build_object('Content-Type','application/json',
--                                   'x-cron-token', (select cron_token from public.push_config where id = 1)),
--     body := '{}'::jsonb, timeout_milliseconds := 20000);
-- $job$);

-- 운영자 등록 (대시보드에서 이메일·비밀번호 사용자를 만든 뒤):
-- insert into public.admins (email) values ('운영자@이메일');

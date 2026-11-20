-- =====================================================================
-- 나이테 우체국 (세대 교차 고민 우체통) — Supabase 스키마 v0.2
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run 하세요. (여러 번 실행해도 안전)
-- 사전 설정: Authentication > Sign In / Providers > "Allow anonymous sign-ins" 켜기
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- 기관 전용 우체통 (2단계 수익 모델용. 지금은 비워 둠)
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- 이용자 (익명 로그인 계정과 1:1). 이름·연락처는 저장하지 않음
create table if not exists public.profiles (
  id               uuid primary key references auth.users on delete cascade,
  age_group        smallint not null check (age_group between 1 and 6), -- 1=10대 … 6=60대 이상
  gender           text check (gender in ('f','m','x')),
  org_id           uuid references public.orgs,
  stamps_received  int not null default 0,       -- 받은 '고마워요 우표' 수
  is_blocked       boolean not null default false,
  created_at       timestamptz not null default now()
);

-- 고민 편지
create table if not exists public.letters (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.profiles on delete cascade,
  org_id      uuid references public.orgs,
  topic       text not null check (topic in ('family','work','love','money','health','lonely','etc')),
  target      text not null check (target in ('older','younger','any')),
  author_age  smallint not null,
  body        text not null check (char_length(body) between 10 and 2000),
  status      text not null default 'waiting'
              check (status in ('waiting','claimed','answered','held','closed')),
              -- held = 위기 신호 감지, 운영자 확인 전까지 배달 안 함
  is_crisis   boolean not null default false,
  is_sample   boolean not null default false,       -- 운영자가 준비한 연습 편지 (화면에 '연습 편지'로 표시)
  claimed_by  uuid references public.profiles on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.letters add column if not exists is_sample boolean not null default false;
create index if not exists letters_waiting_idx    on public.letters (status, created_at) where status = 'waiting';
create index if not exists letters_author_idx     on public.letters (author_id, created_at desc);
create index if not exists letters_claimed_by_idx on public.letters (claimed_by);
create index if not exists letters_org_idx        on public.letters (org_id);

-- 답장 (편지 1통당 1개)
create table if not exists public.replies (
  id          uuid primary key default gen_random_uuid(),
  letter_id   uuid not null unique references public.letters on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles on delete cascade,
  author_age  smallint not null,
  body        text not null check (char_length(body) between 10 and 2000),
  deliver_at  timestamptz not null default now(),   -- '느린 우편': 이 시각 이후에만 고민 작성자에게 보임
  thanked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists replies_author_idx on public.replies (author_id, created_at desc);

-- "다른 편지 받기"로 넘긴 편지 / 연습을 마친 편지 (다시 오지 않게)
create table if not exists public.letter_skips (
  user_id     uuid references public.profiles on delete cascade,
  letter_id   uuid references public.letters on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, letter_id)
);
create index if not exists letter_skips_letter_idx on public.letter_skips (letter_id);

-- 신고
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('letter','reply')),
  target_id    uuid not null,
  reporter_id  uuid not null default auth.uid() references public.profiles on delete cascade,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists profiles_org_idx     on public.profiles (org_id);

-- ---------------------------------------------------------------------
-- 2. 안전 장치 함수
-- ---------------------------------------------------------------------

-- 연락처·링크·SNS 아이디 자동 가림
create or replace function public.mask_contacts(t text) returns text
language sql immutable set search_path = '' as $$
  select
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(t,
      '01[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}', '[연락처 가림]', 'g'),
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[연락처 가림]', 'g'),
      '(https?://|www\.)[^[:space:]]+', '[링크 가림]', 'gi'),
      'open\.kakao\.com[^[:space:]]*', '[링크 가림]', 'gi'),
      '(카톡|카카오톡|인스타|텔레그램|라인)[ ]*(아이디|id|ID)?[ ]*[:：]?[ ]*[A-Za-z0-9_.]{3,}', '\1 [아이디 가림]', 'g'),
      '@[A-Za-z0-9_.]{3,}', '[아이디 가림]', 'g');
$$;

-- 위기 신호 감지 (자살·자해 암시) → 편지를 'held' 로 묶고 운영자가 먼저 확인
create or replace function public.detect_crisis(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t ~ '(죽고[ ]*싶|자살|자해|목숨을[ ]*끊|사라지고[ ]*싶|살기[ ]*싫|극단적[ ]*선택|유서)';
$$;

-- ---------------------------------------------------------------------
-- 3. 트리거
-- ---------------------------------------------------------------------

create or replace function public.tg_letters_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'profile_required'; end if;
  if p.is_blocked then raise exception 'blocked'; end if;

  -- 하루 3통 제한 (도배 방지)
  if (select count(*) from public.letters
       where author_id = p.id and created_at > now() - interval '1 day') >= 3 then
    raise exception 'daily_limit';
  end if;

  new.author_id  := p.id;
  new.author_age := p.age_group;
  new.org_id     := p.org_id;
  new.body       := public.mask_contacts(new.body);
  new.is_crisis  := public.detect_crisis(new.body);
  new.is_sample  := false;
  new.status     := case when new.is_crisis then 'held' else 'waiting' end;
  new.claimed_by := null;
  new.claimed_at := null;
  new.created_at := now();
  return new;
end $$;

-- 이용자는 is_sample 컬럼에 쓸 권한이 없으므로, 연습 편지(운영자 시드)만 트리거를 건너뜀
drop trigger if exists letters_before_insert on public.letters;
create trigger letters_before_insert before insert on public.letters
  for each row when (new.is_sample is not true)
  execute function public.tg_letters_before_insert();

create or replace function public.tg_replies_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles; l public.letters;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'profile_required'; end if;
  if p.is_blocked then raise exception 'blocked'; end if;

  select * into l from public.letters where id = new.letter_id for update;
  if not found or l.is_sample or l.claimed_by is distinct from p.id or l.status <> 'claimed' then
    raise exception 'not_your_letter';
  end if;

  new.author_id  := p.id;
  new.author_age := p.age_group;
  new.body       := public.mask_contacts(new.body);
  -- 느린 우편: 3~12시간 뒤 도착 (운영하며 조정)
  new.deliver_at := now() + interval '3 hours' + (random() * interval '9 hours');
  new.thanked    := false;
  new.created_at := now();

  update public.letters set status = 'answered' where id = l.id;
  return new;
end $$;

drop trigger if exists replies_before_insert on public.replies;
create trigger replies_before_insert before insert on public.replies
  for each row execute function public.tg_replies_before_insert();

-- ---------------------------------------------------------------------
-- 4. RPC (앱에서 호출)
-- ---------------------------------------------------------------------

-- 답장할 편지 한 통 받기
--  · 실제 편지 우선, 연습 편지는 실제 편지가 없을 때만
--  · 다른 세대 우선, 오래 기다린 편지 우선
--  · 48시간 안에 답장이 없으면 다시 배달
create or replace function public.claim_letter() returns public.letters
language plpgsql security definer set search_path = public as $$
declare p public.profiles; l public.letters;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'profile_required'; end if;
  if p.is_blocked then raise exception 'blocked'; end if;

  update public.letters
     set status = 'waiting', claimed_by = null, claimed_at = null
   where status = 'claimed' and claimed_at < now() - interval '48 hours';

  select * into l from public.letters
   where claimed_by = p.id and status = 'claimed'
   limit 1;
  if found then return l; end if;

  select * into l from public.letters x
   where x.status = 'waiting'
     and not x.is_crisis
     and x.author_id <> p.id
     and x.org_id is not distinct from p.org_id
     and ( x.target = 'any'
        or (x.target = 'older'   and p.age_group > x.author_age)
        or (x.target = 'younger' and p.age_group < x.author_age) )
     and not exists (select 1 from public.letter_skips s
                      where s.user_id = p.id and s.letter_id = x.id)
   order by x.is_sample asc, (x.author_age <> p.age_group) desc, x.created_at asc
   limit 1
   for update skip locked;
  if not found then return null; end if;

  -- 연습 편지는 여러 사람이 계속 연습할 수 있도록 잠그지 않음
  if l.is_sample then return l; end if;

  update public.letters
     set status = 'claimed', claimed_by = p.id, claimed_at = now()
   where id = l.id
  returning * into l;
  return l;
end $$;

-- 받은 편지 넘기기
create or replace function public.skip_letter(p_letter_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.letter_skips (user_id, letter_id)
  values (auth.uid(), p_letter_id) on conflict do nothing;
  update public.letters
     set status = 'waiting', claimed_by = null, claimed_at = null
   where id = p_letter_id and claimed_by = auth.uid() and status = 'claimed';
end $$;

-- 연습 편지에 답장: 저장하지 않고 '연습 완료' 처리 (다시 받지 않음)
create or replace function public.practice_reply(p_letter_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.letters where id = p_letter_id and is_sample) then
    raise exception 'not_sample';
  end if;
  insert into public.letter_skips (user_id, letter_id)
  values (auth.uid(), p_letter_id) on conflict do nothing;
end $$;

-- 고마워요 우표 보내기 (고민 작성자만, 도착한 답장에만, 1회)
create or replace function public.thank_reply(p_reply_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  update public.replies r
     set thanked = true
    from public.letters l
   where r.id = p_reply_id
     and l.id = r.letter_id
     and l.author_id = auth.uid()
     and r.deliver_at <= now()
     and not r.thanked
  returning r.author_id into v_author;

  if v_author is not null then
    update public.profiles set stamps_received = stamps_received + 1 where id = v_author;
  end if;
end $$;

-- 첫 화면 숫자 (누구나 조회, 연습 편지 제외)
create or replace function public.public_stats() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'letters', (select count(*) from public.letters where not is_sample),
    'replies', (select count(*) from public.replies),
    'waiting', (select count(*) from public.letters where status = 'waiting' and not is_sample)
  );
$$;

-- ---------------------------------------------------------------------
-- 5. 권한 (RLS + 컬럼 단위 권한)
-- ---------------------------------------------------------------------

alter table public.orgs         enable row level security;
alter table public.profiles     enable row level security;
alter table public.letters      enable row level security;
alter table public.replies      enable row level security;
alter table public.letter_skips enable row level security;
alter table public.reports      enable row level security;

revoke all on public.orgs, public.profiles, public.letters, public.replies,
              public.letter_skips, public.reports from anon, authenticated;

-- profiles: 내 것만. 차단·우표 수는 직접 못 바꿈
grant select on public.profiles to authenticated;
grant insert (id, age_group, gender) on public.profiles to authenticated;
grant update (age_group, gender)     on public.profiles to authenticated;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- letters: 내가 쓴 편지 + 내가 받은(답장 중인) 편지만 보임
grant select on public.letters to authenticated;
grant insert (topic, target, body) on public.letters to authenticated;
drop policy if exists letters_select on public.letters;
drop policy if exists letters_insert on public.letters;
create policy letters_select on public.letters for select to authenticated
  using (author_id = (select auth.uid()) or claimed_by = (select auth.uid()));
create policy letters_insert on public.letters for insert to authenticated
  with check (author_id = (select auth.uid()));

-- replies: 내가 쓴 답장 + 내 편지에 '도착한' 답장만 보임
grant select on public.replies to authenticated;
grant insert (letter_id, body) on public.replies to authenticated;
drop policy if exists replies_select on public.replies;
drop policy if exists replies_insert on public.replies;
create policy replies_select on public.replies for select to authenticated
  using (
    author_id = (select auth.uid())
    or (deliver_at <= now()
        and exists (select 1 from public.letters l
                     where l.id = letter_id and l.author_id = (select auth.uid())))
  );
create policy replies_insert on public.replies for insert to authenticated
  with check (author_id = (select auth.uid()));

-- reports: 쓰기만
grant insert (target_type, target_id, reason) on public.reports to authenticated;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- letter_skips, orgs: 앱에서 직접 접근 없음 (RPC 전용)

-- 함수 실행 권한
revoke all on function public.claim_letter()             from public, anon;
revoke all on function public.skip_letter(uuid)          from public, anon;
revoke all on function public.practice_reply(uuid)       from public, anon;
revoke all on function public.thank_reply(uuid)          from public, anon;
revoke all on function public.tg_letters_before_insert() from public, anon, authenticated;
revoke all on function public.tg_replies_before_insert() from public, anon, authenticated;
grant execute on function public.claim_letter()       to authenticated;
grant execute on function public.skip_letter(uuid)    to authenticated;
grant execute on function public.practice_reply(uuid) to authenticated;
grant execute on function public.thank_reply(uuid)    to authenticated;
grant execute on function public.public_stats()       to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. 초기 데이터: 연습 편지 (운영자 계정 명의, 화면에 '연습 편지'로 표시)
--    실제 이용자가 적은 초기에도 '답장 쓰기'를 바로 체험할 수 있게 함.
--    실제 편지가 있으면 실제 편지가 먼저 배달되고, 연습 답장은 저장되지 않음.
-- ---------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', true, '{"provider":"system"}', '{"name":"나이테 우체국"}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, age_group)
values ('00000000-0000-4000-8000-0000000000a1', 3)
on conflict (id) do nothing;

insert into public.letters (author_id, topic, target, author_age, body, status, is_sample, created_at)
select '00000000-0000-4000-8000-0000000000a1', v.topic, v.target, v.age, v.body, 'waiting', true, now() - (v.ord || ' hours')::interval
from (values
  (1, 'lonely', 'any',     1, '반 친구들과 잘 어울리지 못해서 쉬는 시간이 제일 힘들어요. 어른이 되면 이런 마음이 좀 괜찮아지나요?'),
  (2, 'work',   'any',     2, '입사 2년 차인데 매일 아침 출근길이 너무 무겁습니다. 그만두고 다른 길을 찾고 싶은데, 지금 그만두면 도망치는 것 같아 망설여져요. 이럴 때 어떻게 하셨나요?'),
  (3, 'love',   'any',     3, '결혼을 앞두고 있는데 설렘보다 걱정이 더 커요. 이게 자연스러운 건지, 다들 이런 마음이었는지 궁금합니다.'),
  (4, 'money',  'any',     4, '아이 학원비와 대출 이자 때문에 저축을 전혀 못 하고 있어요. 다들 어떻게 버티시는지, 작은 방법이라도 듣고 싶습니다.'),
  (5, 'health', 'any',     5, '건강검진 결과가 좋지 않게 나와서 요즘 밤마다 걱정이 많습니다. 비슷한 일을 겪어 보신 분이 있다면 마음을 어떻게 다잡으셨는지 궁금해요.'),
  (6, 'family', 'any',     6, '다 큰 자식에게 서운한 마음이 드는데 말을 꺼내기가 어렵습니다. 연락이 뜸한 게 바빠서인 줄 알면서도 섭섭해요. 자식 입장에서는 부모가 어떻게 해 주길 바라나요?'),
  (7, 'etc',    'any',     6, '요즘 스마트폰으로 하는 일이 많아져서 은행 일 하나 보는 것도 겁이 납니다. 자식들에게 매번 묻기도 미안하고요. 젊은 분들은 처음에 이런 걸 어떻게 익히셨나요?'),
  (8, 'work',   'any',     2, '하고 싶은 일과 돈이 되는 일이 달라서 고민이에요. 좋아하는 일을 직업으로 삼는 게 맞을까요, 안정적인 쪽을 택하는 게 맞을까요?'),
  (9, 'family', 'any',     4, '사춘기 아이와 대화만 하면 싸움으로 끝나요. 제가 그 나이 때는 어땠는지 잘 기억도 안 나고요. 어떻게 다가가면 좋을까요?'),
  (10,'lonely', 'any',     3, '서울에 올라와 혼자 산 지 5년째인데, 주말이 되면 연락할 사람이 없다는 게 문득 쓸쓸해요. 다른 분들은 이런 시기를 어떻게 지나셨나요?')
) as v(ord, topic, target, age, body)
where not exists (select 1 from public.letters where is_sample);

-- =====================================================================
-- 운영자용 메모
--  · 위기 편지 확인:   select * from letters where status = 'held' order by created_at;
--  · 확인 후 배달:     update letters set status = 'waiting', is_crisis = false where id = '...';
--  · 신고 목록:        select * from reports order by created_at desc;
--  · 이용 제한:        update profiles set is_blocked = true where id = '...';
--  · 연습 편지 끄기:   update letters set status = 'closed' where is_sample;
-- =====================================================================

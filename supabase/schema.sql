-- 旅遊 App Phase 2 schema（2026-07-04 執行於 dashboard SQL editor）
-- 文件式儲存：整份旅程一筆 JSONB，RLS 限制成員才能讀寫，邀請碼走 security definer RPC。

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  member_uids uuid[] not null default '{}',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.trips enable row level security;

create policy "members_select" on public.trips for select
  using (auth.uid() = any(member_uids));

create policy "members_update" on public.trips for update
  using (auth.uid() = any(member_uids))
  with check (auth.uid() = any(member_uids));

create policy "authed_insert" on public.trips for insert
  with check (auth.uid() is not null and auth.uid() = any(member_uids));

create or replace function public.join_trip(code text)
returns public.trips
language plpgsql security definer set search_path = public
as $$
declare t public.trips;
begin
  update public.trips
     set member_uids = array_append(member_uids, auth.uid())
   where invite_code = upper(code)
     and not (auth.uid() = any(member_uids))
  returning * into t;
  if t.id is null then
    select * into t from public.trips
     where invite_code = upper(code) and auth.uid() = any(member_uids);
  end if;
  if t.id is null then
    raise exception 'INVALID_CODE';
  end if;
  return t;
end $$;

grant execute on function public.join_trip(text) to anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.trips;

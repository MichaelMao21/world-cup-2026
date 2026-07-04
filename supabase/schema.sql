create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  avatar_text text not null default '球' check (char_length(avatar_text) between 1 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prediction_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  match_id text not null,
  match_label text not null,
  status text not null default 'open' check (status in ('open', 'locked', 'halftime', 'finished', 'cancelled')),
  max_players smallint not null default 20 check (max_players between 2 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.prediction_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.predictions (
  room_id uuid not null references public.prediction_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  points integer not null default 0 check (points >= 0),
  hits smallint not null default 0 check (hits >= 0),
  is_winner boolean not null default false,
  submitted_at timestamptz not null default now(),
  scored_at timestamptz,
  primary key (room_id, user_id)
);

create index if not exists room_members_user_idx on public.room_members(user_id);
create index if not exists predictions_user_idx on public.predictions(user_id);
create index if not exists prediction_rooms_match_idx on public.prediction_rooms(match_id);

grant select on public.profiles, public.prediction_rooms, public.room_members, public.predictions to authenticated;
grant insert, update on public.profiles, public.prediction_rooms, public.room_members, public.predictions to authenticated;

create or replace function public.enforce_room_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room_limit integer;
  member_count integer;
begin
  if exists (
    select 1 from public.room_members
    where room_id = new.room_id and user_id = new.user_id
  ) then
    return new;
  end if;

  select max_players into room_limit
  from public.prediction_rooms
  where id = new.room_id and status = 'open'
  for update;

  if room_limit is null then
    raise exception 'room is not open';
  end if;

  select count(*) into member_count from public.room_members where room_id = new.room_id;
  if member_count >= room_limit then
    raise exception 'room is full';
  end if;
  return new;
end;
$$;

drop trigger if exists room_capacity_guard on public.room_members;
create trigger room_capacity_guard
before insert on public.room_members
for each row execute function public.enforce_room_capacity();

revoke all on function public.enforce_room_capacity() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.prediction_rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.predictions enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable" on public.profiles for select using (true);
drop policy if exists "users create own profile" on public.profiles;
create policy "users create own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "rooms are publicly readable" on public.prediction_rooms;
create policy "rooms are publicly readable" on public.prediction_rooms for select using (true);
drop policy if exists "users create rooms" on public.prediction_rooms;
create policy "users create rooms" on public.prediction_rooms for insert with check (auth.uid() = creator_id);
drop policy if exists "creators update rooms" on public.prediction_rooms;
create policy "creators update rooms" on public.prediction_rooms for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

drop policy if exists "room members are publicly readable" on public.room_members;
create policy "room members are publicly readable" on public.room_members for select using (true);
drop policy if exists "users join as themselves" on public.room_members;
create policy "users join as themselves" on public.room_members for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.prediction_rooms room
    where room.id = room_members.room_id and room.status = 'open'
  )
);

drop policy if exists "predictions visible to owner or after reveal" on public.predictions;
create policy "predictions visible to owner or after reveal" on public.predictions for select using (
  auth.uid() = user_id
  or exists (
    select 1 from public.prediction_rooms room
    where room.id = predictions.room_id and room.status in ('halftime', 'finished')
  )
);
drop policy if exists "users submit own prediction" on public.predictions;
create policy "users submit own prediction" on public.predictions for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.room_members member
    join public.prediction_rooms room on room.id = member.room_id
    where member.room_id = predictions.room_id and member.user_id = auth.uid() and room.status = 'open'
  )
);
drop policy if exists "users edit unlocked prediction" on public.predictions;
create policy "users edit unlocked prediction" on public.predictions for update using (
  auth.uid() = user_id
  and exists (select 1 from public.prediction_rooms room where room.id = predictions.room_id and room.status = 'open')
) with check (auth.uid() = user_id);

create or replace function public.get_prediction_leaderboard(limit_count integer default 20)
returns table (
  user_id uuid,
  nickname text,
  avatar_text text,
  total_points bigint,
  predictions_count bigint,
  wins bigint
)
language sql
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.nickname,
    profile.avatar_text,
    coalesce(sum(prediction.points), 0)::bigint,
    count(prediction.room_id)::bigint,
    count(prediction.room_id) filter (where prediction.is_winner)::bigint
  from public.profiles profile
  left join public.predictions prediction on prediction.user_id = profile.id
  group by profile.id, profile.nickname, profile.avatar_text
  order by coalesce(sum(prediction.points), 0) desc, count(prediction.room_id) filter (where prediction.is_winner) desc, profile.created_at asc
  limit greatest(1, least(limit_count, 100));
$$;

grant execute on function public.get_prediction_leaderboard(integer) to anon, authenticated;

create or replace function public.settle_prediction_room(target_room uuid, correct_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  player_count integer;
  top_score integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  select count(*) into player_count from public.room_members where room_id = target_room;

  update public.predictions prediction
  set
    hits = score.hits,
    points = score.base_points,
    scored_at = now(),
    is_winner = false
  from (
    select
      item.user_id,
      count(*) filter (where item.answer_value = correct.entry_value)::smallint as hits,
      coalesce(sum(case when item.answer_value = correct.entry_value then item.weight else 0 end), 0)::integer as base_points
    from (
      select
        prediction_row.user_id,
        answer.entry_key,
        answer.entry_value,
        case answer.entry_key
          when 'halfResult' then 10 when 'halfFirstGoal' then 10 when 'halfGoals' then 10
          when 'result' then 10 when 'fullGoals' then 10 when 'redCard' then 15 when 'yellowCards' then 15
          else 0
        end as weight
      from public.predictions prediction_row
      cross join lateral jsonb_each_text(prediction_row.answers) answer(entry_key, entry_value)
      where prediction_row.room_id = target_room
    ) item
    join lateral jsonb_each_text(correct_answers) correct(entry_key, entry_value) on correct.entry_key = item.entry_key
    group by item.user_id
  ) score
  where prediction.room_id = target_room and prediction.user_id = score.user_id;

  select max(points) into top_score from public.predictions where room_id = target_room;
  update public.predictions
  set
    is_winner = points = top_score,
    points = points + case when points = top_score then greatest(player_count - 1, 1) * 5 else 0 end
  where room_id = target_room;

  update public.prediction_rooms set status = 'finished' where id = target_room;
end;
$$;

revoke all on function public.settle_prediction_room(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.settle_prediction_room(uuid, jsonb) to service_role;

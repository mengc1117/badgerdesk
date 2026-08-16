-- BadgerDesk — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
--
-- Design notes (see README "Decision record"):
--   * No accounts. Clients self-issue a UUID (localStorage) and send it as device_id.
--   * reports is APPEND-ONLY for the anon role: no UPDATE/DELETE policies exist,
--     so nobody can "edit a value to death" — bad data gets diluted and decays.
--   * Rate limiting is enforced by the database itself, not by app code:
--     unique (spot_id, device_id, time_bucket) = one report per spot per hour per device.
--   * Static spot data ships with the app as public/spots.json (39 rows, ~3 KB gzip);
--     it is not stored here. spot_id is validated against that file by the API layer.

-- ─────────────────────────────── dynamic layer ───────────────────────────────

create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  spot_id     text not null,
  device_id   uuid not null,
  crowd       smallint check (crowd between 1 and 5),
  noise       smallint check (noise between 1 and 5),
  created_at  timestamptz not null default now(),
  -- DB-enforced rate limit: one report per spot per device per hour
  time_bucket timestamptz generated always as (date_trunc('hour', created_at)) stored,
  check (crowd is not null or noise is not null),
  unique (spot_id, device_id, time_bucket)
);

create index if not exists reports_recent on public.reports (spot_id, created_at desc);
create index if not exists reports_by_device on public.reports (device_id, created_at desc);

-- One vote per device per field per spot; voting again overwrites (people can
-- change their mind). The composite PK gives upsert semantics for free.
create table if not exists public.amenity_votes (
  spot_id    text not null,
  device_id  uuid not null,
  field      text not null check (field in (
    'outlets','group_rooms','silent_zone','natural_light',
    'food_ok','coffee','restroom','needs_wiscard','noise_base'
  )),
  value      jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (spot_id, device_id, field)
);

create index if not exists amenity_votes_agg on public.amenity_votes (spot_id, field);

-- Hourly aggregates that feed the prior fallback chain and the 7×24 heatmap.
-- Refreshed by the simulate/stats cron (or pg_cron, see below).
create table if not exists public.spot_stats_hourly (
  spot_id    text not null,
  dow        smallint not null check (dow between 0 and 6),
  hour       smallint not null check (hour between 0 and 23),
  crowd_mean real,
  noise_mean real,
  n_samples  int not null default 0,
  primary key (spot_id, dow, hour)
);

-- ─────────────────────────── row level security ──────────────────────────────
-- The Next.js API routes use the service-role key (bypasses RLS). These
-- policies define what the PUBLIC anon key can do — which is exactly:
-- read everything, insert reports/votes, and nothing else. Append-only.

alter table public.reports enable row level security;
alter table public.amenity_votes enable row level security;
alter table public.spot_stats_hourly enable row level security;

create policy "anyone can read reports"
  on public.reports for select to anon, authenticated using (true);

create policy "anyone can submit a report"
  on public.reports for insert to anon, authenticated with check (true);

create policy "anyone can read votes"
  on public.amenity_votes for select to anon, authenticated using (true);

create policy "anyone can cast a vote"
  on public.amenity_votes for insert to anon, authenticated with check (true);

create policy "anyone can read hourly stats"
  on public.spot_stats_hourly for select to anon, authenticated using (true);

-- No UPDATE or DELETE policies on purpose: the anon role cannot modify history.

-- ─────────────────────────────── realtime ────────────────────────────────────
-- Lets browsers subscribe to INSERTs so markers recolor live (two-window demo).

alter publication supabase_realtime add table public.reports;
alter publication supabase_realtime add table public.amenity_votes;

-- ───────────────────────── optional: stats refresh ───────────────────────────
-- If the pg_cron extension is enabled (Database → Extensions), this recomputes
-- the hourly aggregates nightly from the raw reports. Otherwise the GitHub
-- Actions simulate cron keeps recent data flowing and priors matter less.
--
-- select cron.schedule('refresh-spot-stats', '15 8 * * *', $$
--   insert into public.spot_stats_hourly (spot_id, dow, hour, crowd_mean, noise_mean, n_samples)
--   select spot_id,
--          extract(dow  from created_at at time zone 'America/Chicago')::smallint,
--          extract(hour from created_at at time zone 'America/Chicago')::smallint,
--          avg(crowd), avg(noise), count(*)
--   from public.reports
--   where created_at > now() - interval '60 days'
--   group by 1, 2, 3
--   on conflict (spot_id, dow, hour) do update
--     set crowd_mean = excluded.crowd_mean,
--         noise_mean = excluded.noise_mean,
--         n_samples  = excluded.n_samples;
-- $$);

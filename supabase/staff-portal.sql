-- Staff portal migration. Review and run in the SAME development Supabase
-- project as supabase.sql. Run supabase.sql first if bookings does not exist.
-- This script adds tables/bucket only; it does not change existing bookings.
-- Create employee accounts through Owner > Crew after applying this migration.
-- No public signup or direct browser database access is enabled here.

create table if not exists public.staff_members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id bigint not null references public.bookings(id) on delete restrict,
  worker_id uuid references public.staff_members(id) on delete set null,
  service_date date not null check (extract(isodow from service_date) between 1 and 5),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'submitted', 'completed', 'absent')),
  started_at timestamptz,
  completed_at timestamptz,
  front_photo_path text,
  back_photo_path text,
  review_note text check (char_length(review_note) <= 1000),
  notes text check (char_length(notes) <= 1000),
  updated_at timestamptz not null default now(),
  unique (booking_id, service_date),
  check (status not in ('submitted', 'completed') or
    (front_photo_path is not null and back_photo_path is not null and
     started_at is not null and completed_at is not null))
);
create index if not exists service_jobs_worker_date_idx on public.service_jobs(worker_id, service_date);
create index if not exists service_jobs_service_date_idx on public.service_jobs(service_date);

create table if not exists public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.staff_members(id) on delete cascade,
  kind text not null check (kind in ('supplies', 'question', 'issue')),
  message text not null check (char_length(message) between 1 and 2000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists staff_requests_worker_idx on public.staff_requests(worker_id, created_at desc);

-- Browser/anon/authenticated requests have NO table policies. Server-side
-- handlers use service_role only after validating signed owner/worker sessions
-- and filtering every worker query by the authenticated employee ID.
alter table public.staff_members enable row level security;
alter table public.service_jobs enable row level security;
alter table public.staff_requests enable row level security;
revoke all on public.staff_members, public.service_jobs, public.staff_requests from anon, authenticated;
grant all on public.staff_members, public.service_jobs, public.staff_requests to service_role;

-- Private evidence photos, max 5 MiB. Never expose a public bucket or service
-- role key to employees; handlers issue authorized 60-second signed URLs.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('service-photos', 'service-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

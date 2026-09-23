alter table public.profiles add column if not exists phone text;

create unique index if not exists profiles_phone_key
  on public.profiles(phone)
  where phone is not null;

create table if not exists public.phone_verification_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  request_ip text,
  created_at timestamptz not null default now()
);

create index if not exists phone_verification_codes_phone_created
  on public.phone_verification_codes(phone, created_at desc);

alter table public.phone_verification_codes enable row level security;

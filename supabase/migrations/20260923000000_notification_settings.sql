create table if not exists public.platform_notification_settings (
  id text primary key check (id = 'default'),
  smtp_enabled boolean not null default false,
  smtp_host text,
  smtp_port integer not null default 587,
  smtp_secure boolean not null default true,
  smtp_username text,
  smtp_password_ciphertext text,
  smtp_from_email text,
  smtp_from_name text,
  sms_enabled boolean not null default false,
  sms_provider text not null default 'aliyun' check (sms_provider in ('aliyun','tencent','twilio')),
  sms_access_key_id_ciphertext text,
  sms_access_key_secret_ciphertext text,
  sms_sign_name text,
  sms_template_code text,
  sms_region text,
  sms_app_id text,
  updated_at timestamptz not null default now()
);

insert into public.platform_notification_settings(id)
values ('default')
on conflict (id) do nothing;

alter table public.platform_notification_settings enable row level security;

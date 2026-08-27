create extension if not exists pgcrypto;

create type app_role as enum ('admin','recepcion');
create type visit_status as enum ('dentro','fuera');
create type prereg_status as enum ('pendiente','usada','vencida','cancelada');

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  full_name text not null,
  email text,
  slack_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  company_id uuid references companies(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

insert into companies (name) values
  ('Tendencys Innovations'),
  ('Ecartpay'),
  ('FulFillment'),
  ('Para Paquetes');

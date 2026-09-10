-- ─────────────────────────────────────────────────────────────
--  Vigil.OS / Judicator Docs — Supabase Database & Storage Schema
--  Run this script in your Supabase SQL Editor:
--  https://supabase.com/dashboard/project/_/sql
-- ─────────────────────────────────────────────────────────────

-- 1. Enable pgcrypto for cryptographic hashing & UUIDs
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- 2. Registry Snapshot Table (Atomic State Synchronization)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.vigil_registry_snapshot (
    id text primary key default 'active',
    version integer not null default 1,
    data jsonb not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.vigil_registry_snapshot is 'Stores atomic snapshot state of the Vigil.OS case registry and forensic audit log';

-- Enable Row Level Security (RLS)
alter table public.vigil_registry_snapshot enable row level security;

-- Permissive policy for read/write by anon and authenticated roles
create policy "Allow all access to registry snapshot"
    on public.vigil_registry_snapshot
    for all
    to anon, authenticated, service_role
    using (true)
    with check (true);


-- ─────────────────────────────────────────────────────────────
-- 3. Normalized Relational Tables for Deep Querying
-- ─────────────────────────────────────────────────────────────

-- Users Table
create table if not exists public.vigil_users (
    id text primary key,
    name text not null,
    email text unique not null,
    badge text not null,
    role text not null,
    password_hash text not null,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    last_login_at timestamp with time zone
);

alter table public.vigil_users enable row level security;
create policy "Allow read/write access to vigil_users"
    on public.vigil_users
    for all
    to anon, authenticated, service_role
    using (true)
    with check (true);

-- Cases Table
create table if not exists public.vigil_cases (
    id text primary key,
    case_number text unique not null,
    title text not null,
    summary text default '',
    status text not null,
    priority text not null,
    classification text not null,
    jurisdiction text not null,
    lead text not null,
    lead_id text not null,
    assigned_officer_ids jsonb default '[]'::jsonb,
    statute text default '',
    tags jsonb default '[]'::jsonb,
    opened_at timestamp with time zone default timezone('utc'::text, now()) not null,
    closed_at timestamp with time zone
);

alter table public.vigil_cases enable row level security;
create policy "Allow read/write access to vigil_cases"
    on public.vigil_cases
    for all
    to anon, authenticated, service_role
    using (true)
    with check (true);

-- Documents Table
create table if not exists public.vigil_documents (
    id text primary key,
    case_id text not null references public.vigil_cases(id) on delete cascade,
    ref_id text not null,
    name text not null,
    category text not null,
    classification text not null,
    status text not null,
    current_version text not null default 'v1.0.0',
    versions jsonb not null default '[]'::jsonb,
    tags jsonb default '[]'::jsonb,
    shared_with jsonb default '[]'::jsonb,
    storage text not null default 'supabase',
    cloud_uri text,
    ocr_status text,
    ocr_text text,
    ocr_engine text,
    created_by_id text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_vigil_docs_case on public.vigil_documents(case_id);
create index if not exists idx_vigil_docs_status on public.vigil_documents(status);

alter table public.vigil_documents enable row level security;
create policy "Allow read/write access to vigil_documents"
    on public.vigil_documents
    for all
    to anon, authenticated, service_role
    using (true)
    with check (true);

-- Audit Events Table (Chain of Custody)
create table if not exists public.vigil_audit_events (
    id text primary key,
    at timestamp with time zone default timezone('utc'::text, now()) not null,
    action text not null,
    actor_id text not null,
    actor_name text not null,
    actor_badge text not null,
    actor_role text not null,
    case_id text,
    document_id text,
    document_ref text,
    target_name text,
    sha256 text,
    prev_hash text,
    integrity_status text,
    details text,
    metadata jsonb default '{}'::jsonb
);

create index if not exists idx_vigil_audit_action on public.vigil_audit_events(action);
create index if not exists idx_vigil_audit_doc on public.vigil_audit_events(document_id);
create index if not exists idx_vigil_audit_sha256 on public.vigil_audit_events(sha256);

alter table public.vigil_audit_events enable row level security;
create policy "Allow read/write access to vigil_audit_events"
    on public.vigil_audit_events
    for all
    to anon, authenticated, service_role
    using (true)
    with check (true);

-- Assets Table
create table if not exists public.vigil_assets (
    id text primary key,
    tag text unique not null,
    name text not null,
    category text not null,
    serial text not null,
    status text not null,
    assigned_to text not null,
    station text not null,
    acquired_at timestamp with time zone not null,
    last_service_at timestamp with time zone not null,
    service_interval_days integer default 90,
    linked_case_id text references public.vigil_cases(id) on delete set null,
    events jsonb default '[]'::jsonb
);

alter table public.vigil_assets enable row level security;
create policy "Allow read/write access to vigil_assets"
    on public.vigil_assets
    for all
    to anon, authenticated, service_role
    using (true)
    with check (true);

-- Notifications Table
create table if not exists public.vigil_notifications (
    id text primary key,
    user_id text not null,
    type text not null,
    title text not null,
    message text not null,
    is_read boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    linked_entity_id text,
    linked_entity_type text
);

create index if not exists idx_vigil_notifs_user on public.vigil_notifications(user_id, is_read);

alter table public.vigil_notifications enable row level security;
create policy "Allow read/write access to vigil_notifications"
    on public.vigil_notifications
    for all
    to anon, authenticated, service_role
    using (true)
    with check (true);


-- ─────────────────────────────────────────────────────────────
-- 4. Supabase Storage Bucket Setup (evidence-vault)
-- ─────────────────────────────────────────────────────────────

-- Create evidence-vault storage bucket if it does not already exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'evidence-vault',
    'evidence-vault',
    true,
    52428800, -- 50 MB
    array[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/tiff'
    ]
)
on conflict (id) do update set
    public = true,
    file_size_limit = 52428800;

-- Storage RLS Policies
create policy "Public Access to Evidence Vault Objects"
    on storage.objects for select
    using (bucket_id = 'evidence-vault');

create policy "Allow Upload to Evidence Vault"
    on storage.objects for insert
    with check (bucket_id = 'evidence-vault');

create policy "Allow Update in Evidence Vault"
    on storage.objects for update
    using (bucket_id = 'evidence-vault');

create policy "Allow Delete in Evidence Vault"
    on storage.objects for delete
    using (bucket_id = 'evidence-vault');

-- ─────────────────────────────────────────────────────────────
-- Done! Your Supabase database and storage are configured for Vigil.OS.
-- ─────────────────────────────────────────────────────────────

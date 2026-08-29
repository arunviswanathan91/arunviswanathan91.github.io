create extension if not exists pgcrypto;

create type task_status as enum ('Backlog','In progress','Review','Done');
create type publication_stage as enum ('Idea','Drafting','Submitted','Revision','Published');
create type job_stage as enum ('Saved','Preparing','Applied','Interview','Offer','Closed');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  telegram_chat_id bigint unique,
  created_at timestamptz not null default now()
);
create table projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text, status text not null default 'Active', created_at timestamptz not null default now()
);
create table tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null, title text not null, status task_status not null default 'Backlog',
  priority text not null default 'Medium' check(priority in ('Low','Medium','High')), due_at timestamptz,
  source text not null default 'dashboard', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table publications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, venue text, stage publication_stage not null default 'Idea', next_action text, due_at timestamptz,
  doi text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null, title text not null, kind text not null,
  drive_file_id text, drive_url text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table job_applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  organization text not null, role text not null, stage job_stage not null default 'Saved', url text,
  deadline timestamptz, next_action text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table inbox_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  body text not null, source text not null default 'telegram', processed boolean not null default false, created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table publications enable row level security;
alter table documents enable row level security;
alter table job_applications enable row level security;
alter table inbox_items enable row level security;

create policy "own profile" on profiles for all using (auth.uid()=id) with check (auth.uid()=id);
create policy "own projects" on projects for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own tasks" on tasks for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own publications" on publications for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own documents" on documents for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own jobs" on job_applications for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own inbox" on inbox_items for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index tasks_user_status_idx on tasks(user_id,status);
create index publications_user_stage_idx on publications(user_id,stage);
create index jobs_user_stage_idx on job_applications(user_id,stage);

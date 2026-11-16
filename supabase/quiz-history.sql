create table if not exists public.quiz_history (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (mode in ('practice', 'mistakes', 'test')),
  topic text not null,
  score numeric not null check (score >= 0),
  total numeric not null check (total > 0 and score <= total),
  question_count integer not null check (question_count > 0),
  correct_count integer not null check (correct_count >= 0 and correct_count <= question_count),
  completed_at timestamptz not null
);

alter table public.quiz_history enable row level security;

create policy "Users read own quiz history"
  on public.quiz_history for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add own quiz history"
  on public.quiz_history for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own quiz history"
  on public.quiz_history for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own quiz history"
  on public.quiz_history for delete to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists quiz_history_user_completed_idx
  on public.quiz_history (user_id, completed_at desc);

grant select, insert, update, delete on public.quiz_history to authenticated;

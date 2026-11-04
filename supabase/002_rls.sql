-- =============================================================================
-- 002_rls.sql   (run order: 2 of 3)
--
-- Row Level Security: decides who can touch which rows.
--
-- Two kinds of visitors reach the database through the same public API key:
--   anon           students (nobody is logged in)
--   authenticated  the instructor (logged in through Supabase Auth)
--
-- The security model, in short:
--   * Students can READ the active survey (and its questions/choices). That is
--     all they can do directly. They cannot read or write responses/answers.
--   * Students WRITE only by calling the submit_survey_response() function
--     (003), which validates everything. There are deliberately NO insert
--     policies for anon (DECISIONS.md #3).
--   * The instructor can do everything on every table.
--
-- Safe to re-run: policies are dropped and re-created.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- is_instructor(): "is the caller the logged-in instructor?"
--
-- Why not just use the 'authenticated' role (as DATABASE.md's example does)?
-- Supabase can also hand out *anonymous* sign-ins that count as 'authenticated'
-- if that feature is ever switched on. This check also requires that the JWT is
-- NOT an anonymous sign-in, so only a real account qualifies. Together with
-- "public signups disabled" (DECISIONS.md #7) this means only the instructor
-- account you create by hand gets instructor powers.
--
-- Returns false when there is no JWT at all (e.g. SQL editor, anon).
-- Used by the policies below and by the instructor-only functions in 003.
-- -----------------------------------------------------------------------------
create or replace function public.is_instructor()
returns boolean
language sql
stable
set search_path = ''
as $$
    select coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
       and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;


-- -----------------------------------------------------------------------------
-- Turn RLS on. With RLS on and no matching policy, access is denied.
-- -----------------------------------------------------------------------------
alter table public.surveys   enable row level security;
alter table public.questions enable row level security;
alter table public.choices   enable row level security;
alter table public.responses enable row level security;
alter table public.answers   enable row level security;


-- -----------------------------------------------------------------------------
-- Table privileges (a second lock, underneath RLS).
-- Supabase grants anon broad table privileges by default and relies on RLS to
-- restrict them. We remove everything from anon and give back only SELECT on the
-- three tables students may read. Even if a policy were added by mistake later,
-- anon still could not insert/update/delete, and could not touch
-- responses/answers at all.
-- -----------------------------------------------------------------------------
revoke all on table public.surveys, public.questions, public.choices,
                    public.responses, public.answers
    from anon;

grant select on table public.surveys, public.questions, public.choices to anon;

grant select, insert, update, delete
    on table public.surveys, public.questions, public.choices,
             public.responses, public.answers
    to authenticated;


-- -----------------------------------------------------------------------------
-- STUDENTS (anon): read-only access to the active survey.
-- These follow docs/DATABASE.md sections 8. The student page itself uses
-- get_public_survey() (003) so it can tell "closed" from "not found"; these
-- policies are the underlying guarantee that a student can never read a draft,
-- a closed survey, or anything else, even by calling the API directly.
-- -----------------------------------------------------------------------------
drop policy if exists "students read active surveys" on public.surveys;
create policy "students read active surveys"
    on public.surveys
    for select
    to anon
    using (status = 'active');

drop policy if exists "students read active survey questions" on public.questions;
create policy "students read active survey questions"
    on public.questions
    for select
    to anon
    using (
        exists (
            select 1
            from public.surveys
            where surveys.id = questions.survey_id
              and surveys.status = 'active'
        )
    );

drop policy if exists "students read active survey choices" on public.choices;
create policy "students read active survey choices"
    on public.choices
    for select
    to anon
    using (
        exists (
            select 1
            from public.questions
            join public.surveys on surveys.id = questions.survey_id
            where questions.id = choices.question_id
              and surveys.status = 'active'
        )
    );

-- There are intentionally NO policies for anon on responses or answers:
-- students cannot read results, and cannot insert rows directly.


-- -----------------------------------------------------------------------------
-- INSTRUCTOR: full access to every table.
-- "(select ...)" lets Postgres evaluate is_instructor() once per query instead
-- of once per row, which is much faster on large tables.
-- -----------------------------------------------------------------------------
drop policy if exists "instructor manages surveys" on public.surveys;
create policy "instructor manages surveys"
    on public.surveys
    for all
    to authenticated
    using ((select public.is_instructor()))
    with check ((select public.is_instructor()));

drop policy if exists "instructor manages questions" on public.questions;
create policy "instructor manages questions"
    on public.questions
    for all
    to authenticated
    using ((select public.is_instructor()))
    with check ((select public.is_instructor()));

drop policy if exists "instructor manages choices" on public.choices;
create policy "instructor manages choices"
    on public.choices
    for all
    to authenticated
    using ((select public.is_instructor()))
    with check ((select public.is_instructor()));

drop policy if exists "instructor manages responses" on public.responses;
create policy "instructor manages responses"
    on public.responses
    for all
    to authenticated
    using ((select public.is_instructor()))
    with check ((select public.is_instructor()));

drop policy if exists "instructor manages answers" on public.answers;
create policy "instructor manages answers"
    on public.answers
    for all
    to authenticated
    using ((select public.is_instructor()))
    with check ((select public.is_instructor()));

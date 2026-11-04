-- =============================================================================
-- 001_schema.sql   (run order: 1 of 3)
--
-- Creates the five tables, their indexes, the "updated_at" trigger, and the
-- rule that only one survey can be active at a time.
--
-- Follows docs/DATABASE.md. Nothing here controls WHO can read or write the
-- data; that is 002_rls.sql. Do not skip 002: until RLS is enabled, tables in
-- the public schema are readable/writable by anyone holding the anon key.
--
-- Safe to re-run: everything uses "if not exists" / "or replace". Note that
-- re-running will NOT change a table that already exists.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- surveys: one row per survey.
--   status      draft -> active -> closed -> archived (see DECISIONS.md #6)
--   public_slug short random id used in the student URL /s/<slug>. It is NULL
--               until the survey is first activated (see activate_survey()).
-- -----------------------------------------------------------------------------
create table if not exists public.surveys (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    description text,
    status      text not null default 'draft'
        check (status in ('draft', 'active', 'closed', 'archived')),
    public_slug text unique,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists surveys_status_idx on public.surveys (status);


-- -----------------------------------------------------------------------------
-- questions: belong to a survey. Deleting a survey deletes its questions.
--   position orders the questions inside the survey (1, 2, 3, ...).
-- -----------------------------------------------------------------------------
create table if not exists public.questions (
    id            uuid primary key default gen_random_uuid(),
    survey_id     uuid not null references public.surveys (id) on delete cascade,
    question_text text not null,
    question_type text not null
        check (question_type in ('multiple_choice', 'true_false')),
    position      integer not null,
    created_at    timestamptz not null default now()
);

create index if not exists questions_survey_id_idx on public.questions (survey_id);


-- -----------------------------------------------------------------------------
-- choices: the answer options of a question. True/False questions also get two
-- real rows here, "True" and "False" (DECISIONS.md #9), so every answer points
-- at a choice and the results query works the same for both question types.
-- -----------------------------------------------------------------------------
create table if not exists public.choices (
    id          uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.questions (id) on delete cascade,
    choice_text text not null,
    position    integer not null,
    created_at  timestamptz not null default now()
);

create index if not exists choices_question_id_idx on public.choices (question_id);


-- -----------------------------------------------------------------------------
-- responses: one row per student submission.
--   anonymous_token is a random id the student's browser generates and keeps in
--   localStorage. It is how we stop accidental double submissions; it is NOT an
--   identity and does not identify a person.
-- -----------------------------------------------------------------------------
create table if not exists public.responses (
    id              uuid primary key default gen_random_uuid(),
    survey_id       uuid not null references public.surveys (id) on delete cascade,
    anonymous_token text,
    submitted_at    timestamptz not null default now()
);

create index if not exists responses_survey_id_idx   on public.responses (survey_id);
create index if not exists responses_submitted_at_idx on public.responses (submitted_at);

-- Duplicate protection: the same browser token can submit to a given survey only
-- once. This is enforced by the database itself, so it holds even if two
-- submissions arrive at the same instant. (Rows without a token are exempt, but
-- submit_survey_response() always requires one.)
create unique index if not exists responses_unique_student_per_survey
    on public.responses (survey_id, anonymous_token)
    where anonymous_token is not null;


-- -----------------------------------------------------------------------------
-- answers: one row per answered question inside a response.
--   choice_id is set to NULL if a choice is ever deleted (on delete set null);
--   that is one reason surveys can only be edited while still a draft.
--   text_answer is unused in version 1 (reserved for short-answer questions).
--   unique (response_id, question_id): a response answers each question once.
-- -----------------------------------------------------------------------------
create table if not exists public.answers (
    id          uuid primary key default gen_random_uuid(),
    response_id uuid not null references public.responses (id) on delete cascade,
    question_id uuid not null references public.questions (id) on delete cascade,
    choice_id   uuid references public.choices (id) on delete set null,
    text_answer text,
    created_at  timestamptz not null default now(),
    unique (response_id, question_id)
);

create index if not exists answers_response_id_idx on public.answers (response_id);
create index if not exists answers_question_id_idx on public.answers (question_id);
create index if not exists answers_choice_id_idx   on public.answers (choice_id);


-- -----------------------------------------------------------------------------
-- updated_at trigger: keeps surveys.updated_at current on every UPDATE.
-- "set search_path = ''" is a Supabase security best practice: the function
-- cannot be tricked into calling look-alike objects from another schema.
-- -----------------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists surveys_updated_at on public.surveys;
create trigger surveys_updated_at
    before update on public.surveys
    for each row
    execute function public.update_updated_at_column();


-- -----------------------------------------------------------------------------
-- Only one active survey at a time.
-- A partial unique index: it only covers rows whose status is 'active', and it
-- is unique on status, so a second 'active' row is rejected by the database.
-- activate_survey() (003) closes the old one first, so users never hit this
-- error in normal use; it is the safety net for races and direct edits.
-- -----------------------------------------------------------------------------
create unique index if not exists only_one_active_survey
    on public.surveys ((status))
    where status = 'active';

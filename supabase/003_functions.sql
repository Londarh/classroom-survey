-- =============================================================================
-- 003_functions.sql   (run order: 3 of 3)
--
-- The database functions (RPCs) the app calls with supabase.rpc('name', {...}).
-- Requires 001 and 002 to have been run first (uses is_instructor()).
--
--   Instructor only                      Callable by students (anon)
--   ------------------------------       -----------------------------------
--   save_draft_survey                    get_public_survey
--   activate_survey                      submit_survey_response
--   close_survey
--   archive_survey
--   get_survey_results
--
-- HOW THE SECURITY WORKS (read this once, it applies to every function below)
--
--  1. "security definer": the function runs with its owner's rights, not the
--     caller's. This is what lets a student's submission write to tables the
--     student has no direct access to. It also means each function must do its
--     own checks, which they do.
--
--  2. "set search_path = ''": the function cannot be tricked into using
--     look-alike tables or functions from another schema. Every table below is
--     therefore written as public.<name>.
--
--  3. Two locks on instructor functions. First the EXECUTE privilege: Supabase
--     lets anon call any function in the public schema by default, so each
--     function ends with "revoke ... from public, anon, authenticated" followed
--     by a grant to only the roles that need it. Second, a check inside the
--     function (is_instructor()), so a stray grant still would not be enough.
--
--  4. Errors are raised as exceptions whose MESSAGE is a short code such as
--     SURVEY_NOT_ACTIVE. The app reads error.message and shows a friendly text
--     (DECISIONS.md). Raw database errors are never meant to reach students.
--
-- Safe to re-run: every function is "create or replace".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- generate_survey_slug(): internal helper, returns a short random slug such as
-- 'x7kf2q' that is not already used. The alphabet leaves out look-alike
-- characters (0/o, 1/l/i) so the URL is easy to read aloud and type.
-- Nobody can call it directly (no grants); activate_survey() uses it.
-- Note: random() is fine here because the slug is just an address. Real
-- protection comes from RLS and the functions, not from a secret URL.
-- -----------------------------------------------------------------------------
create or replace function public.generate_survey_slug()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
    v_slug     text;
    v_i        integer;
begin
    loop
        v_slug := '';
        for v_i in 1..6 loop
            v_slug := v_slug
                || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
        end loop;
        exit when not exists (select 1 from public.surveys where public_slug = v_slug);
    end loop;
    return v_slug;
end;
$$;

revoke all on function public.generate_survey_slug() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- save_draft_survey(survey_id, title, description, questions)
--
-- Saves a whole survey (title, description, every question and choice) in ONE
-- transaction. If anything is invalid, nothing is saved, so a failed save can
-- never leave half a survey behind.
--
--   p_survey_id  NULL to create a new draft, or the id of an existing DRAFT to
--                overwrite. Only drafts can be edited (DECISIONS.md #2).
--   p_questions  JSON array, in display order (array order becomes "position"):
--       [
--         { "question_text": "What is required for recursion?",
--           "question_type": "multiple_choice",
--           "choices": [ {"choice_text": "A base case"}, {"choice_text": "A loop"} ] },
--         { "question_text": "Every recursive function needs a stopping condition.",
--           "question_type": "true_false" }
--       ]
--     true_false questions need no "choices": True and False are created here.
--
-- A draft may have zero questions (work in progress). Activation checks that the
-- survey is complete. Existing questions/choices of the draft are replaced; that
-- is safe because a draft can have no responses yet.
--
-- Returns {"id": "<survey uuid>", "status": "draft"}.
-- Errors: NOT_AUTHORIZED, SURVEY_NOT_FOUND, SURVEY_NOT_EDITABLE,
--         VALIDATION_ERROR (the error "detail" says what to fix).
-- -----------------------------------------------------------------------------
create or replace function public.save_draft_survey(
    p_survey_id   uuid,
    p_title       text,
    p_description text,
    p_questions   jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_survey_id     uuid;
    v_status        text;
    v_title         text := btrim(coalesce(p_title, ''));
    v_description   text := nullif(btrim(coalesce(p_description, '')), '');
    v_questions     jsonb := coalesce(p_questions, '[]'::jsonb);
    v_q             jsonb;
    v_c             jsonb;
    v_q_pos         integer := 0;
    v_c_pos         integer;
    v_question_id   uuid;
    v_question_text text;
    v_question_type text;
    v_choice_text   text;
begin
    if not public.is_instructor() then
        raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;

    -- Validate the survey-level fields first.
    if v_title = '' or char_length(v_title) > 200 then
        raise exception 'VALIDATION_ERROR'
            using detail = 'The survey title is required (200 characters at most).';
    end if;
    if v_description is not null and char_length(v_description) > 2000 then
        raise exception 'VALIDATION_ERROR'
            using detail = 'The description is too long (2000 characters at most).';
    end if;
    -- (Two separate checks: SQL does not promise "or" is evaluated left to
    -- right, and jsonb_array_length() errors on a non-array.)
    if jsonb_typeof(v_questions) <> 'array' then
        raise exception 'VALIDATION_ERROR'
            using detail = 'Questions must be a list.';
    end if;
    if jsonb_array_length(v_questions) > 50 then
        raise exception 'VALIDATION_ERROR'
            using detail = 'A survey can have at most 50 questions.';
    end if;

    -- Create a new draft, or lock and overwrite an existing one.
    if p_survey_id is null then
        insert into public.surveys (title, description)
        values (v_title, v_description)
        returning id into v_survey_id;
    else
        -- "for update" locks the row so two saves (or a save and an activation)
        -- cannot interleave.
        select status into v_status
        from public.surveys
        where id = p_survey_id
        for update;

        if not found then
            raise exception 'SURVEY_NOT_FOUND';
        end if;
        if v_status <> 'draft' then
            raise exception 'SURVEY_NOT_EDITABLE'
                using detail = 'Only draft surveys can be edited.';
        end if;

        v_survey_id := p_survey_id;
        update public.surveys
        set title = v_title, description = v_description
        where id = v_survey_id;

        -- Remove the old questions; their choices go with them (on delete cascade).
        delete from public.questions where survey_id = v_survey_id;
    end if;

    -- Insert every question, then its choices.
    for v_q in select value from jsonb_array_elements(v_questions) loop
        v_q_pos := v_q_pos + 1;

        if jsonb_typeof(v_q) <> 'object' then
            raise exception 'VALIDATION_ERROR'
                using detail = format('Question %s is not valid.', v_q_pos);
        end if;

        v_question_text := btrim(coalesce(v_q ->> 'question_text', ''));
        v_question_type := v_q ->> 'question_type';

        if v_question_text = '' or char_length(v_question_text) > 1000 then
            raise exception 'VALIDATION_ERROR'
                using detail = format('Question %s needs text (1000 characters at most).', v_q_pos);
        end if;
        if v_question_type is null
           or v_question_type not in ('multiple_choice', 'true_false') then
            raise exception 'VALIDATION_ERROR'
                using detail = format('Question %s has an unknown type.', v_q_pos);
        end if;

        insert into public.questions (survey_id, question_text, question_type, position)
        values (v_survey_id, v_question_text, v_question_type, v_q_pos)
        returning id into v_question_id;

        if v_question_type = 'true_false' then
            -- Fixed choices; anything the client sent for choices is ignored.
            insert into public.choices (question_id, choice_text, position)
            values (v_question_id, 'True', 1),
                   (v_question_id, 'False', 2);
        else
            if jsonb_typeof(v_q -> 'choices') is distinct from 'array' then
                raise exception 'VALIDATION_ERROR'
                    using detail = format('Question %s needs a list of choices.', v_q_pos);
            end if;

            v_c_pos := 0;
            for v_c in select value from jsonb_array_elements(v_q -> 'choices') loop
                v_choice_text := btrim(coalesce(v_c ->> 'choice_text', ''));
                if v_choice_text = '' or char_length(v_choice_text) > 500 then
                    raise exception 'VALIDATION_ERROR'
                        using detail = format('Every choice in question %s needs text (500 characters at most).', v_q_pos);
                end if;

                v_c_pos := v_c_pos + 1;
                insert into public.choices (question_id, choice_text, position)
                values (v_question_id, v_choice_text, v_c_pos);
            end loop;

            if v_c_pos < 2 or v_c_pos > 20 then
                raise exception 'VALIDATION_ERROR'
                    using detail = format('Question %s needs between 2 and 20 choices.', v_q_pos);
            end if;
        end if;
    end loop;

    return jsonb_build_object('id', v_survey_id, 'status', 'draft');
end;
$$;

revoke all on function public.save_draft_survey(uuid, text, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.save_draft_survey(uuid, text, text, jsonb)
    to authenticated;


-- -----------------------------------------------------------------------------
-- activate_survey(survey_id)
--
-- draft -> active. In one transaction it:
--   1. closes whichever survey is currently active (only one at a time),
--   2. creates the public slug if this survey does not have one yet,
--   3. marks the survey active.
-- A survey must have at least one question and every question at least two
-- choices. Calling it on an already-active survey just returns it (so a double
-- click is harmless). Closed/archived surveys cannot be reactivated
-- (DECISIONS.md #6): duplicate them instead.
--
-- Returns {"id": "...", "status": "active", "public_slug": "x7kf2q"}.
-- Errors: NOT_AUTHORIZED, SURVEY_NOT_FOUND, INVALID_STATUS_TRANSITION,
--         SURVEY_INCOMPLETE, ACTIVATION_CONFLICT.
-- -----------------------------------------------------------------------------
create or replace function public.activate_survey(p_survey_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
    v_slug   text;
begin
    if not public.is_instructor() then
        raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;

    select * into v_survey
    from public.surveys
    where id = p_survey_id
    for update;

    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    if v_survey.status = 'active' then
        return jsonb_build_object(
            'id', v_survey.id, 'status', v_survey.status, 'public_slug', v_survey.public_slug);
    end if;

    if v_survey.status <> 'draft' then
        raise exception 'INVALID_STATUS_TRANSITION'
            using detail = 'Only a draft survey can be activated. Duplicate it to run it again.';
    end if;

    -- Completeness: at least one question, every question has 2+ choices.
    if not exists (select 1 from public.questions where survey_id = p_survey_id) then
        raise exception 'SURVEY_INCOMPLETE'
            using detail = 'Add at least one question before activating.';
    end if;
    if exists (
        select 1
        from public.questions q
        where q.survey_id = p_survey_id
          and (select count(*) from public.choices c where c.question_id = q.id) < 2
    ) then
        raise exception 'SURVEY_INCOMPLETE'
            using detail = 'Every question needs at least two choices.';
    end if;

    v_slug := coalesce(v_survey.public_slug, public.generate_survey_slug());

    begin
        update public.surveys
        set status = 'closed'
        where status = 'active' and id <> p_survey_id;

        update public.surveys
        set status = 'active', public_slug = v_slug
        where id = p_survey_id;
    exception when unique_violation then
        -- Two activations raced; the one-active-survey index stopped the loser.
        raise exception 'ACTIVATION_CONFLICT'
            using detail = 'Another survey was activated at the same time. Try again.';
    end;

    return jsonb_build_object('id', p_survey_id, 'status', 'active', 'public_slug', v_slug);
end;
$$;

revoke all on function public.activate_survey(uuid) from public, anon, authenticated;
grant execute on function public.activate_survey(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- close_survey(survey_id)
--
-- active -> closed. submit_survey_response() takes a share lock on the survey
-- row and this function takes an exclusive one, so once this commits, any
-- submission that has not already finished fails with SURVEY_NOT_ACTIVE.
-- Closing an already-closed survey just returns it.
--
-- Returns {"id": "...", "status": "closed"}.
-- Errors: NOT_AUTHORIZED, SURVEY_NOT_FOUND, INVALID_STATUS_TRANSITION.
-- -----------------------------------------------------------------------------
create or replace function public.close_survey(p_survey_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_status text;
begin
    if not public.is_instructor() then
        raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;

    select status into v_status
    from public.surveys
    where id = p_survey_id
    for update;

    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    if v_status = 'active' then
        update public.surveys set status = 'closed' where id = p_survey_id;
    elsif v_status <> 'closed' then
        raise exception 'INVALID_STATUS_TRANSITION'
            using detail = 'Only an active survey can be closed.';
    end if;

    return jsonb_build_object('id', p_survey_id, 'status', 'closed');
end;
$$;

revoke all on function public.close_survey(uuid) from public, anon, authenticated;
grant execute on function public.close_survey(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- archive_survey(survey_id)
--
-- closed -> archived, or draft -> archived. An ACTIVE survey must be closed
-- first. Archiving keeps all responses (it hides the survey; it deletes
-- nothing). Archiving an already-archived survey just returns it.
--
-- Returns {"id": "...", "status": "archived"}.
-- Errors: NOT_AUTHORIZED, SURVEY_NOT_FOUND, INVALID_STATUS_TRANSITION.
-- -----------------------------------------------------------------------------
create or replace function public.archive_survey(p_survey_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_status text;
begin
    if not public.is_instructor() then
        raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;

    select status into v_status
    from public.surveys
    where id = p_survey_id
    for update;

    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    if v_status = 'active' then
        raise exception 'INVALID_STATUS_TRANSITION'
            using detail = 'Close the survey before archiving it.';
    elsif v_status in ('draft', 'closed') then
        update public.surveys set status = 'archived' where id = p_survey_id;
    end if;

    return jsonb_build_object('id', p_survey_id, 'status', 'archived');
end;
$$;

revoke all on function public.archive_survey(uuid) from public, anon, authenticated;
grant execute on function public.archive_survey(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- get_public_survey(slug)   -- STUDENTS call this to open /s/<slug>
--
-- Looks a survey up by its public slug and returns just what the student page
-- needs. It exists because plain RLS makes a closed survey invisible, which
-- would show "not found" instead of "no longer accepting responses"
-- (DECISIONS.md #4). Callable by anyone, so it is careful about what it reveals:
--
--   active                       -> full survey with questions and choices
--   closed or archived           -> only {"status": "closed"}, no content
--   unknown slug or never-active -> {"status": "not_found"}
--
-- Never returns responses, answers, or counts.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_survey(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
begin
    -- Reject anything that cannot be a slug before touching the tables.
    if p_slug is null or p_slug !~ '^[A-Za-z0-9_-]{1,64}$' then
        return jsonb_build_object('status', 'not_found');
    end if;

    select * into v_survey from public.surveys where public_slug = p_slug;

    if not found or v_survey.status = 'draft' then
        return jsonb_build_object('status', 'not_found');
    end if;

    if v_survey.status <> 'active' then
        return jsonb_build_object('status', 'closed');
    end if;

    return jsonb_build_object(
        'status', 'active',
        'survey', jsonb_build_object(
            'id', v_survey.id,
            'title', v_survey.title,
            'description', v_survey.description
        ),
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'position', q.position,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'id', c.id,
                                'choice_text', c.choice_text,
                                'position', c.position
                            )
                            order by c.position
                        )
                        from public.choices c
                        where c.question_id = q.id
                    ), '[]'::jsonb)
                )
                order by q.position
            )
            from public.questions q
            where q.survey_id = v_survey.id
        ), '[]'::jsonb)
    );
end;
$$;

revoke all on function public.get_public_survey(text) from public, anon, authenticated;
grant execute on function public.get_public_survey(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- submit_survey_response(survey_id, anonymous_token, answers)
--   -- STUDENTS call this; it is the ONLY way a student writes data.
--
--   p_anonymous_token  random id from the student's browser (16-128 characters:
--                      letters, digits, '-' or '_'; a UUID works).
--   p_answers          [ {"question_id": "<uuid>", "choice_id": "<uuid>"}, ... ]
--
-- Everything happens in one transaction: either the response and ALL its
-- answers are stored, or nothing is. It checks, in this order:
--   survey exists and is active ........... SURVEY_NOT_ACTIVE
--   token looks valid ..................... INVALID_TOKEN
--   answers is a non-empty list (<= 100) .. INVALID_PAYLOAD
--   this token has not submitted before ... DUPLICATE_RESPONSE
--   each question belongs to this survey
--     and is answered at most once ........ INVALID_QUESTION
--   each choice belongs to its question ... INVALID_CHOICE
--   every question in the survey answered . MISSING_REQUIRED_ANSWER
--
-- Returns {"success": true, "response_id": "<uuid>"}.
-- The error code is the exception message; read error.message in the app.
-- -----------------------------------------------------------------------------
create or replace function public.submit_survey_response(
    p_survey_id       uuid,
    p_anonymous_token text,
    p_answers         jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    c_uuid_pattern constant text :=
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_status      text;
    v_elem        jsonb;
    v_question_id uuid;
    v_choice_id   uuid;
    v_seen        uuid[] := '{}';
    v_response_id uuid;
begin
    -- 1. The survey must exist and be active. "for share" holds a lock until
    --    this transaction ends, so close_survey() cannot slip in halfway
    --    through: a submission either finishes before the close, or fails.
    --    Unknown and inactive surveys give the same error on purpose.
    select status into v_status
    from public.surveys
    where id = p_survey_id
    for share;

    if v_status is distinct from 'active' then
        raise exception 'SURVEY_NOT_ACTIVE';
    end if;

    -- 2. The token must be present and well-formed.
    if p_anonymous_token is null
       or p_anonymous_token !~ '^[A-Za-z0-9_-]{16,128}$' then
        raise exception 'INVALID_TOKEN';
    end if;

    -- 3. The payload must be a non-empty JSON list of reasonable size.
    --    (Two separate checks: jsonb_array_length() errors on a non-array, and
    --    SQL does not promise "or" is evaluated left to right.)
    if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
        raise exception 'INVALID_PAYLOAD';
    end if;
    if jsonb_array_length(p_answers) = 0 or jsonb_array_length(p_answers) > 100 then
        raise exception 'INVALID_PAYLOAD';
    end if;

    -- 4. Friendly duplicate check. (The unique index is the real guarantee and
    --    is handled again at the insert below, for simultaneous submissions.)
    if exists (
        select 1
        from public.responses
        where survey_id = p_survey_id
          and anonymous_token = p_anonymous_token
    ) then
        raise exception 'DUPLICATE_RESPONSE';
    end if;

    -- 5. Validate every answer. Values are pattern-checked BEFORE being cast to
    --    uuid so malformed input gives our error code, not a raw database error.
    for v_elem in select value from jsonb_array_elements(p_answers) loop
        if jsonb_typeof(v_elem) <> 'object' then
            raise exception 'INVALID_PAYLOAD';
        end if;

        if jsonb_typeof(v_elem -> 'question_id') is distinct from 'string'
           or (v_elem ->> 'question_id') !~ c_uuid_pattern then
            raise exception 'INVALID_QUESTION';
        end if;
        v_question_id := (v_elem ->> 'question_id')::uuid;

        -- The question must belong to THIS survey (not some other survey).
        if not exists (
            select 1 from public.questions
            where id = v_question_id and survey_id = p_survey_id
        ) then
            raise exception 'INVALID_QUESTION';
        end if;

        -- ...and may be answered only once per submission.
        if v_question_id = any (v_seen) then
            raise exception 'INVALID_QUESTION';
        end if;
        v_seen := v_seen || v_question_id;

        if jsonb_typeof(v_elem -> 'choice_id') is distinct from 'string'
           or (v_elem ->> 'choice_id') !~ c_uuid_pattern then
            raise exception 'INVALID_CHOICE';
        end if;
        v_choice_id := (v_elem ->> 'choice_id')::uuid;

        -- The choice must belong to the question it is submitted for.
        if not exists (
            select 1 from public.choices
            where id = v_choice_id and question_id = v_question_id
        ) then
            raise exception 'INVALID_CHOICE';
        end if;
    end loop;

    -- 6. Every question in the survey must be answered (all are required).
    if exists (
        select 1
        from public.questions q
        where q.survey_id = p_survey_id
          and q.id <> all (v_seen)
    ) then
        raise exception 'MISSING_REQUIRED_ANSWER';
    end if;

    -- 7. Store it. If two submissions with the same token arrive at the same
    --    moment, the unique index lets one through and rejects the other, which
    --    we turn into the same friendly code.
    begin
        insert into public.responses (survey_id, anonymous_token)
        values (p_survey_id, p_anonymous_token)
        returning id into v_response_id;
    exception when unique_violation then
        raise exception 'DUPLICATE_RESPONSE';
    end;

    insert into public.answers (response_id, question_id, choice_id)
    select v_response_id,
           (e ->> 'question_id')::uuid,
           (e ->> 'choice_id')::uuid
    from jsonb_array_elements(p_answers) as e;

    return jsonb_build_object('success', true, 'response_id', v_response_id);
end;
$$;

revoke all on function public.submit_survey_response(uuid, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.submit_survey_response(uuid, text, jsonb)
    to anon, authenticated;


-- -----------------------------------------------------------------------------
-- get_survey_results(survey_id)   -- INSTRUCTOR ONLY
--
-- Counts and percentages per choice, shaped like docs/API.md section 11, plus
-- the survey title and status for the results page header:
--
--   { "survey_id": "...", "title": "...", "status": "closed",
--     "response_count": 52,
--     "questions": [ { "question_id": "...", "question_text": "...",
--         "question_type": "multiple_choice",
--         "response_count": 52,          -- answers given to this question
--         "choices": [ { "choice_id": "...", "choice_text": "A base case",
--                        "count": 45, "percentage": 86.5 } ] } ] }
--
-- percentage = count / (answers to that question) * 100, one decimal; it is 0
-- for a question nobody has answered yet. Questions and choices come back in
-- their display order, and every choice appears even with a count of 0.
--
-- Errors: NOT_AUTHORIZED, SURVEY_NOT_FOUND.
-- -----------------------------------------------------------------------------
create or replace function public.get_survey_results(p_survey_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
    v_total  bigint;
begin
    if not public.is_instructor() then
        raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;

    select * into v_survey from public.surveys where id = p_survey_id;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    select count(*) into v_total
    from public.responses
    where survey_id = p_survey_id;

    return jsonb_build_object(
        'survey_id', v_survey.id,
        'title', v_survey.title,
        'status', v_survey.status,
        'response_count', v_total,
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'question_id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'response_count', qc.cnt,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'choice_id', c.id,
                                'choice_text', c.choice_text,
                                'count', cc.cnt,
                                'percentage', case
                                    when qc.cnt = 0 then 0
                                    else round(cc.cnt * 100.0 / qc.cnt, 1)
                                end
                            )
                            order by c.position
                        )
                        from public.choices c
                        cross join lateral (
                            select count(*) as cnt
                            from public.answers a
                            where a.choice_id = c.id
                        ) cc
                        where c.question_id = q.id
                    ), '[]'::jsonb)
                )
                order by q.position
            )
            from public.questions q
            cross join lateral (
                select count(*) as cnt
                from public.answers a
                where a.question_id = q.id and a.choice_id is not null
            ) qc
            where q.survey_id = v_survey.id
        ), '[]'::jsonb)
    );
end;
$$;

revoke all on function public.get_survey_results(uuid) from public, anon, authenticated;
grant execute on function public.get_survey_results(uuid) to authenticated;

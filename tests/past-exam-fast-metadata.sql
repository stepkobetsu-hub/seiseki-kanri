begin;
do $$
declare r jsonb;
begin
r:=public.past_exam_mutate('patch','[{"key":"__verification__","before":null,"after":{"files":[],"noan":true}}]');
if not (r->>'ok')::boolean then raise exception 'insert failed'; end if;
r:=public.past_exam_mutate('patch','[{"key":"__verification__","before":null,"after":{"files":[],"noan":true}}]');
if not (r->>'ok')::boolean then raise exception 'retry failed'; end if;
r:=public.past_exam_mutate('patch','[{"key":"__verification__","before":null,"after":{"files":[],"noan":false}}]');
if not (r->>'conflict')::boolean then raise exception 'conflict detection failed'; end if;
r:=public.past_exam_mutate('patch','[{"key":"__verification__","before":{"files":[],"noan":true},"after":null}]');
if not (r->>'ok')::boolean then raise exception 'removal failed'; end if;
if exists(select 1 from public.past_exam_state where payload->'db' ? '__verification__') then raise exception 'removal missing'; end if;
if has_table_privilege('anon','public.past_exam_state','select') then raise exception 'anon has direct access'; end if;
if has_function_privilege('anon','public.past_exam_mutate(text,jsonb,bigint)','execute') then raise exception 'anon has mutation access'; end if;
end $$;
rollback;
select 'patch insert / idempotency / conflict / removal / access checks passed' result;
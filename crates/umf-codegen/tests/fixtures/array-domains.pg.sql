INSERT INTO pg_temp.decimal_items (owner, state, due_at, priority, await_keys)
VALUES ('test', 'pending', '2026-01-01T00:00:00Z', 0, '{1.23,-2.34}'),
       ('test', 'pending', '2026-01-01T00:00:00Z', 0, '{}');
INSERT INTO pg_temp.date_items (owner, state, due_at, priority, await_keys)
VALUES ('test', 'pending', '2026-01-01T00:00:00Z', 0, '{9999-12-31,0001-01-01}'),
       ('test', 'pending', '2026-01-01T00:00:00Z', 0, '{}');
INSERT INTO pg_temp.timestamp_items (owner, state, due_at, priority, await_keys)
VALUES ('test', 'pending', '2026-01-01T00:00:00Z', 0, '{9999-12-31T23:59:59.999999Z,0001-01-01T00:00:00Z}'),
       ('test', 'pending', '2026-01-01T00:00:00Z', 0, '{}');

DO $test$
DECLARE
    example record;
BEGIN
    FOR example IN SELECT * FROM (VALUES
        ('decimal_items', '{1,NaN}'),
        ('decimal_items', '{1,NULL}'),
        ('decimal_items', '{{1,2},{3,4}}'),
        ('decimal_items', '[0:1]={1,2}'),
        ('date_items', '{2026-01-01,infinity}'),
        ('date_items', '{2026-01-01,10000-01-01}'),
        ('date_items', '{"0001-01-01 BC",2026-01-01}'),
        ('timestamp_items', '{2026-01-01T00:00:00Z,-infinity}'),
        ('timestamp_items', '{10000-01-01T00:00:00Z,2026-01-01T00:00:00Z}')
    ) AS invalid(table_name, items)
    LOOP
        BEGIN
            EXECUTE format(
                'INSERT INTO pg_temp.%I (owner, state, due_at, priority, await_keys)
                 VALUES (''test'', ''pending'', ''2026-01-01T00:00:00Z'', 0, %L)',
                example.table_name, example.items);
            RAISE EXCEPTION 'Invalid array was accepted: % %', example.table_name, example.items;
        EXCEPTION WHEN check_violation THEN
            NULL;
        END;
    END LOOP;
END;
$test$;

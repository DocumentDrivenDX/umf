# SPDX-License-Identifier: MIT OR Apache-2.0
"""Successor-only actual ranked caller-context controls, not compiler metadata edits."""

import asyncio
import json

import psycopg
from umf_access.postgres_read import ReadObligationUnmet
from umf_access.postgres_search import AsyncPostgresSearchTarget, PostgresSearchTarget


def exercise_ranked_strict_context(queries, configuration, admin, dsn):
    plans = [value for name, value in vars(queries).items() if name.startswith('_S')]
    variants = tuple(variant for plan in plans for variant in plan.variants)
    plan = next(plan for plan in plans if plan.name == 'string_list')
    statement = json.loads(plan.variants[0].entries[0].program.statements_json)['/statement']['sql']
    original = plan.variants[0].entries[0].artifact()
    assert original['selectionTemplate']['binding']['schemaBinding'] == 'search-path'
    assert original['selectionTemplate']['binding'].get('schema') is None
    admin.execute('CREATE SCHEMA wrong_app')
    admin.execute('CREATE TABLE wrong_app.docs(id text)')
    admin.execute('GRANT USAGE ON SCHEMA wrong_app TO search_user')
    admin.execute('GRANT SELECT ON wrong_app.docs TO search_user')
    counts = {'sync': 0, 'async': 0}
    checks = []

    class Cursor(psycopg.Cursor):
        def execute(self, query, params=None, **kwargs):
            if query == statement:
                counts['sync'] += 1
            return super().execute(query, params, **kwargs)

    class AsyncCursor(psycopg.AsyncCursor):
        async def execute(self, query, params=None, **kwargs):
            if query == statement:
                counts['async'] += 1
            return await super().execute(query, params, **kwargs)

    connection = psycopg.connect(dsn + ' user=search_user', cursor_factory=Cursor)
    try:
        target = PostgresSearchTarget(connection, configuration, search_variants=variants)
        for mode, path in [('correct', 'pg_catalog, search_app, pg_temp'), ('wrong-schema', 'pg_catalog, wrong_app, pg_temp'), ('temporary-shadow', 'pg_catalog, pg_temp, search_app')]:
            if mode == 'temporary-shadow':
                connection.execute('CREATE TEMP TABLE docs(id text)')
            connection.execute('SET search_path TO ' + path)
            connection.commit()
            before = counts['sync']
            if mode == 'correct':
                result = queries.string_list(target, term='cats', values=['other'])
                assert [hit.item.id for hit in result] == ['b']
                assert counts['sync'] == before + 1
            else:
                try:
                    queries.string_list(target, term='cats', values=['other'])
                except ReadObligationUnmet as error:
                    assert 'resolution' in str(error) or 'binding' in str(error) or 'schema' in str(error), str(error)
                else:
                    raise AssertionError('strict caller-context mismatch released data')
                assert counts['sync'] == before
            assert connection.info.transaction_status == 0
            checks.append({'kind': 'actual-ranked-strict-sync-' + mode, 'businessDispatches': counts['sync'] - before})
    finally:
        connection.close()

    async def asynchronous():
        connection = await psycopg.AsyncConnection.connect(dsn + ' user=search_user', cursor_factory=AsyncCursor)
        try:
            target = AsyncPostgresSearchTarget(connection, configuration, search_variants=variants)
            for mode, path in [('correct', 'pg_catalog, search_app, pg_temp'), ('wrong-schema', 'pg_catalog, wrong_app, pg_temp'), ('temporary-shadow', 'pg_catalog, pg_temp, search_app')]:
                if mode == 'temporary-shadow':
                    await connection.execute('CREATE TEMP TABLE docs(id text)')
                await connection.execute('SET search_path TO ' + path)
                await connection.commit()
                before = counts['async']
                if mode == 'correct':
                    result = await queries.string_list(target, term='cats', values=['other'])
                    assert [hit.item.id for hit in result] == ['b']
                    assert counts['async'] == before + 1
                else:
                    try:
                        await queries.string_list(target, term='cats', values=['other'])
                    except ReadObligationUnmet as error:
                        assert 'resolution' in str(error) or 'binding' in str(error) or 'schema' in str(error), str(error)
                    else:
                        raise AssertionError('strict async caller-context mismatch released data')
                    assert counts['async'] == before
                assert connection.info.transaction_status == 0
                checks.append({'kind': 'actual-ranked-strict-async-' + mode, 'businessDispatches': counts['async'] - before})
        finally:
            await connection.close()
    asyncio.run(asynchronous())
    return checks

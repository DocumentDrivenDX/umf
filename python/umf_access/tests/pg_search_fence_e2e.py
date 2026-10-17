"""Actual installed target fence callbacks; owned-local fixture helper only."""

import asyncio
import json
import threading
import time

import psycopg
from umf_access.catalog import ReadPlan
from umf_access.pages import StreamLimitReached
from umf_access.postgres_search import AsyncPostgresSearchTarget, PostgresSearchTarget
from umf_access.targets import AsyncPostgresTarget, PostgresTarget


def exercise_fence(queries, configuration, admin, dsn):
    checks = []
    plans = {value.name: value for value in vars(queries).values() if isinstance(value, ReadPlan)}
    raw_entries = tuple(variant.entry for plan in plans.values() for variant in plan.variants)
    raw_sql = {name: plan.variants[0].entry.artifact()['dbapiSql'] for name, plan in plans.items()}
    ranked_plans = {value.name: value for name, value in vars(queries).items() if name.startswith('_S')}
    ranked_variants = tuple(variant for plan in ranked_plans.values() for variant in plan.variants)
    ranked_sql = json.loads(ranked_plans['string_list'].variants[0].entries[0].program.statements_json)['/statement']['sql']
    active = {'sql': None, 'callback': None}
    dispatch = {}

    def held(connection):
        return admin.execute("SELECT c.relname,l.mode FROM pg_catalog.pg_lock_status() l JOIN pg_catalog.pg_class c ON c.oid=l.relation JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE l.pid=%s AND n.nspname='native_fence' AND l.mode='ShareLock' AND l.granted", (connection.info.backend_pid,)).fetchall()

    def blocked_alter(label):
        writer = psycopg.connect(dsn + ' user=sdk_test', autocommit=True)
        outcome = {}
        thread = None
        try:
            writer.execute("SET statement_timeout='800ms'")
            def alter():
                try:
                    writer.execute('ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.simple')
                    outcome['unexpectedSuccess'] = True
                except psycopg.Error as error:
                    outcome.update(sqlstate=error.sqlstate, message=str(error))
            thread = threading.Thread(target=alter)
            thread.start()
            waiting = []
            for _ in range(100):
                waiting = admin.execute("SELECT c.relname,l.mode,l.granted,a.wait_event_type,a.wait_event FROM pg_catalog.pg_lock_status() l JOIN pg_catalog.pg_class c ON c.oid=l.relation JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE l.pid=%s AND NOT l.granted", (writer.info.backend_pid,)).fetchall()
                if waiting:
                    break
                time.sleep(.005)
            thread.join(2)
            assert not thread.is_alive() and outcome.get('sqlstate') == '57014' and waiting, (outcome, waiting)
            checks.append({'kind': label, 'originalAlterOutcome': outcome, 'actualWaiting': waiting})
        finally:
            if thread is not None and thread.is_alive():
                writer.cancel()
                thread.join(2)
            if outcome.get('unexpectedSuccess'):
                writer.execute('ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.english_stem')
            writer.close()
            assert thread is None or not thread.is_alive()

    class Cursor(psycopg.Cursor):
        def execute(self, query, params=None, **kwargs):
            dispatch[query] = dispatch.get(query, 0) + 1
            if query == active['sql'] and active['callback'] is not None:
                callback, active['callback'] = active['callback'], None
                callback()
            return super().execute(query, params, **kwargs)

    connection = psycopg.connect(dsn + ' user=search_user', cursor_factory=Cursor)
    try:
        raw = PostgresTarget(connection, configuration, catalog_entries=raw_entries)
        ranked = PostgresSearchTarget(connection, configuration, search_variants=ranked_variants)
        raw.verify()
        ranked.verify()
        for label, statement, call, expected in (
            ('actual-sync-raw-before-business', raw_sql['raw_terms'], lambda: queries.raw_terms(raw, words='red'), [('a',), ('c',)]),
            ('actual-sync-ranked-before-business', ranked_sql, lambda: [hit.item.id for hit in queries.string_list(ranked, term='cats', values=[None, 'é%\\'])], ['a']),
        ):
            active.update(sql=statement, callback=lambda label=label: blocked_alter(label))
            assert call() == expected
            assert active['callback'] is None and connection.info.transaction_status == 0 and not held(connection)
        active.update(sql=None, callback=None)
        page = queries.raw_pages(raw, words='cats', after=None)
        assert page.items == (('a',),) and page.next_after is not None and not held(connection)
        page = queries.raw_pages(raw, words='cats', after=page.next_after)
        assert page.items == (('b',),) and not held(connection)
        checks.append({'kind': 'actual-page-continuation-and-lock-release'})
        before = dispatch.get(raw_sql['raw_pages'], 0)
        stream = queries.raw_pages_stream(raw, words='cats', after=None, max_rows=4, page_size=1)
        assert next(stream) == ('a',) and held(connection)
        assert dispatch[raw_sql['raw_pages']] == before + 1
        blocked_alter('actual-sync-stream-lock-held-across-yielded-page')
        assert list(stream) == [('b',), ('c',)]
        assert connection.info.transaction_status == 0 and not held(connection)
        stream = queries.raw_pages_stream(raw, words='cats', after=None, max_rows=4, page_size=1)
        assert next(stream) == ('a',) and held(connection)
        stream.close()
        assert connection.info.transaction_status == 0 and not held(connection)
        checks.append({'kind': 'actual-sync-stream-close-rolls-back-locks'})
        stream = queries.raw_pages_stream(raw, words='cats', after=None, max_rows=1, page_size=1)
        seen = []
        try:
            seen.extend(stream)
        except StreamLimitReached as error:
            assert error.truncated is None
        else:
            raise AssertionError('bounded stream masqueraded as exhaustion')
        assert seen == [('a',)] and connection.info.transaction_status == 0 and not held(connection)
        checks.append({'kind': 'actual-sync-stream-limit-explicit-and-cleaned'})
        writer = psycopg.connect(dsn + ' user=sdk_test', autocommit=True)
        try:
            writer.execute('BEGIN')
            writer.execute('LOCK TABLE pg_catalog.pg_ts_config_map IN ROW EXCLUSIVE MODE')
            for statement, call in ((raw_sql['raw_terms'], lambda: queries.raw_terms(raw, words='red')), (ranked_sql, lambda: queries.string_list(ranked, term='cats', values=['other']))):
                before = dispatch.get(statement, 0)
                try:
                    call()
                except psycopg.errors.LockNotAvailable:
                    pass
                else:
                    raise AssertionError('writer-first contention released results')
                assert dispatch.get(statement, 0) == before and connection.info.transaction_status == 0 and not held(connection)
            checks.append({'kind': 'actual-raw-ranked-writer-first-refuse-before-business'})
        finally:
            writer.execute('ROLLBACK')
            writer.close()
    finally:
        connection.close()

    async def async_cases():
        async_active = {'sql': None, 'callback': None}
        async_dispatch = {}
        class AsyncCursor(psycopg.AsyncCursor):
            async def execute(self, query, params=None, **kwargs):
                async_dispatch[query] = async_dispatch.get(query, 0) + 1
                if query == async_active['sql'] and async_active['callback'] is not None:
                    callback, async_active['callback'] = async_active['callback'], None
                    await callback()
                return await super().execute(query, params, **kwargs)
        connection = await psycopg.AsyncConnection.connect(dsn + ' user=search_user', cursor_factory=AsyncCursor)
        try:
            raw = AsyncPostgresTarget(connection, configuration, catalog_entries=raw_entries)
            ranked = AsyncPostgresSearchTarget(connection, configuration, search_variants=ranked_variants)
            await raw.verify()
            await ranked.verify()
            for label, statement, call, expected in (
                ('actual-async-raw-before-business', raw_sql['raw_terms'], lambda: queries.raw_terms(raw, words='red'), [('a',), ('c',)]),
                ('actual-async-ranked-before-business', ranked_sql, lambda: queries.string_list(ranked, term='cats', values=['other']), ['b']),
            ):
                async_active.update(sql=statement, callback=lambda label=label: asyncio.to_thread(blocked_alter, label))
                result = await call()
                if statement == ranked_sql:
                    result = [hit.item.id for hit in result]
                assert result == expected
                assert async_active['callback'] is None and connection.info.transaction_status == 0 and not held(connection)
            async_active.update(sql=None, callback=None)
            page = await queries.raw_pages(raw, words='cats', after=None)
            assert page.items == (('a',),) and not held(connection)
            before = async_dispatch.get(raw_sql['raw_pages'], 0)
            stream = queries.raw_pages_stream(raw, words='cats', after=None, max_rows=4, page_size=1)
            assert await stream.__anext__() == ('a',) and held(connection)
            assert async_dispatch[raw_sql['raw_pages']] == before + 1
            await asyncio.to_thread(blocked_alter, 'actual-async-stream-lock-held-across-yielded-page')
            assert [row async for row in stream] == [('b',), ('c',)]
            assert connection.info.transaction_status == 0 and not held(connection)
            stream = queries.raw_pages_stream(raw, words='cats', after=None, max_rows=4, page_size=1)
            assert await stream.__anext__() == ('a',) and held(connection)
            await stream.aclose()
            assert connection.info.transaction_status == 0 and not held(connection)
            checks.append({'kind': 'actual-async-stream-close-cleans-locks'})
            stream = queries.raw_pages_stream(raw, words='cats', after=None, max_rows=4, page_size=1)
            assert await stream.__anext__() == ('a',)
            entered = asyncio.Event()
            async def suspend_before_business():
                entered.set()
                await asyncio.Event().wait()
            async_active.update(sql=raw_sql['raw_pages'], callback=suspend_before_business)
            pending = asyncio.create_task(stream.__anext__())
            await asyncio.wait_for(entered.wait(), 2)
            assert held(connection)
            pending.cancel()
            try:
                await pending
            except asyncio.CancelledError:
                pass
            else:
                raise AssertionError('stream cancellation swallowed')
            await stream.aclose()
            assert connection.info.transaction_status == 0 and not held(connection)
            checks.append({'kind': 'actual-async-stream-cancel-rolls-back-locks'})
        finally:
            await connection.close()
    asyncio.run(async_cases())
    return checks

"""Real authored full-record projections, native source fences and stream bounds.

Caller owns the isolated PG18 cluster and its original pgvector 0.8.7 install.
Only dedicated fixture schemas and the dedicated reader are touched here.
"""
from __future__ import annotations

import asyncio
import hashlib
import importlib.metadata
import json
import os
import subprocess
import sys
import sysconfig
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

import psycopg

DECLARATIONS = '''from search_docs.models import Doc
from search_docs.keys import DocKey
from umf_access import query, Param
@query
def rows():
    return Doc.objects.order_by(Doc.c.id.asc()).limit(1000).all()
@query
def projected():
    return Doc.objects.select(Doc.c.id,Doc.c.body,Doc.c.embedding,Doc.c.count,Doc.c.amount,Doc.c.payload).order_by(Doc.c.id.asc()).limit(1000).all()
@query
def pages(after:Param[DocKey|None]):
    return Doc.objects.select(Doc.c.id,Doc.c.body,Doc.c.embedding,Doc.c.count,Doc.c.amount,Doc.c.payload).order_by(Doc.c.id.asc()).page(size=25,after=after)
'''


def main():
    root = Path(sys.argv[1]).resolve()
    request = json.loads((root / 'stage-one-request.json').read_text())
    model, physical = request['sources']
    text = model['text']
    binding = {
        'version': 'umf.raw-read-binding/0.1', 'modelJson': text,
        'modelSha256': hashlib.sha256(text.encode()).hexdigest(), 'schema': None,
        'schemaBinding': 'search-path', 'relationships': [],
        'tables': [{'logical': ['search', 'Doc'], 'native': 'docs', 'key': ['id'], 'columns': [
            {'logical': field, 'native': field, 'carrier': carrier, 'nullable': False}
            for field, carrier in [('id', 'string'), ('body', 'string'), ('count', 'integer'), ('amount', 'decimal')]
        ]}],
        'nativeColumns': {'target': {'platform': 'postgresql', 'majorVersion': '18'}, 'sets': [{
            'columnSet': {'documentId': json.loads(text)['id'], 'coreVersion': '0.8.0',
                          'documentSha256': hashlib.sha256(text.encode()).hexdigest(), 'module': 'search',
                          'pointer': '/modules/0/extensions/umf.access/columns/0'},
            'binding': {'sourceId': physical['id'], 'documentJson': physical['text'],
                        'documentSha256': hashlib.sha256(physical['text'].encode()).hexdigest()},
        }], 'vectorExtension': {'schema': 'public', 'version': '0.8.7'}},
    }
    for name, source in [('model.json', model), ('physical.json', physical)]:
        (root / name).write_text(source['text'])
    config = {'package': 'search_docs', 'modules': ['projection_declarations'],
              'targets': [{'id': 'pg', 'kind': 'postgresql', 'backendId': 'weft-postgresql',
                           'backendVersion': 'raw-read/0.1', 'targetProfile': 'weft.raw-read/0.1',
                           'platform': [{'name': 'postgresql', 'versions': ['180006']}],
                           'schemaBinding': 'search-path', 'binding': binding}],
              'weft': {'distribution': 'weft-sql', 'version': importlib.metadata.version('weft-sql')},
              'umf': {'documents': [{'path': name, 'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()}
                                    for name in ['model.json', 'physical.json']]}}
    (root / 'config.json').write_text(json.dumps(config, indent=2) + '\n')
    (root / 'projection_declarations.py').write_text(DECLARATIONS)
    site = Path(sysconfig.get_path('purelib'))

    def snapshot():
        return {str(path.relative_to(site)): hashlib.sha256(path.read_bytes()).hexdigest()
                for directory in [site / 'umf_access', site / 'weft'] for path in sorted(directory.rglob('*'))
                if path.is_file() and path.suffix in ('.py', '.so') and '__pycache__' not in path.parts}

    before = snapshot()
    checks = []
    status = 'FAILED'
    cleanup = False
    schemas = ('sdk_projection_a', 'sdk_projection_b', 'sdk_projection_bad_width', 'sdk_projection_bad_scale')
    dsn = os.environ['UMF_PG_TEST_DSN']

    def passed(name):
        checks.append(name)
        print('PASS', name, flush=True)

    def build(check=False):
        command = [str(Path(sys.executable).parent / 'umf-access'), 'catalog', '--root', str(root), '--config', str(root / 'config.json')]
        if check:
            command.append('--check')
        with (root / ('catalog-check.log' if check else 'catalog-build.log')).open('w') as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)

    try:
        build()
        build(True)
        passed('actual-public-cli-build-and-check-full-record-and-stream')
        sys.path.insert(0, str(root))
        from search_docs import queries
        from search_docs.codecs import encode_Doc_create
        from search_docs.models import DocCreate
        from umf_access import StreamLimitReached
        from umf_access.pages import ReadObligationUnmet, StaleContinuation
        from umf_access.targets import (
            AsyncPostgresTarget,
            PostgresConfiguration,
            PostgresTarget,
            binding_digest,
        )

        assert 'weft' not in sys.modules
        amount = Decimal('1234567890123456789012345678.1234567890')
        vector = (0.10000000149011612, -0.0, 1.0)
        created = DocCreate(id='schema-only', body='e\u0301 and \u00e9', embedding=vector,
                            count=2**63-1, amount=amount, payload=b'\x00\xff')
        assert encode_Doc_create(created)['amount'].as_tuple() == amount.as_tuple()
        passed('actual-authored-schema-load-instance-and-exact-codec')
        original = queries._Q0.variants[0].entry.artifact()
        assert original['binding']['schema'] is None
        assert all(schema not in original['dbapiSql'] for schema in schemas)
        assert original['obligations']['nativeProjection']['nativeCatalogBeforeAfter'] is True
        passed('one-original-schema-neutral-program-and-native-column-admissions')
        with psycopg.connect(dsn, autocommit=True) as admin:
            admin.execute('CREATE EXTENSION vector VERSION \'0.8.7\'')
            assert admin.execute("SELECT extversion FROM pg_catalog.pg_extension WHERE extname='vector'").fetchone() == ('0.8.7',)
            admin.execute('CREATE ROLE projection_reader LOGIN')
            admin.execute('GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO projection_reader')
            for schema in schemas:
                admin.execute(f'CREATE SCHEMA {schema}')
                width = 'integer' if schema.endswith('width') else 'bigint'
                scale = 9 if schema.endswith('scale') else 10
                admin.execute(f'CREATE TABLE {schema}.docs (id text COLLATE "C" PRIMARY KEY, body text NOT NULL, embedding public.vector(3) NOT NULL, count {width} NOT NULL, amount numeric(38,{scale}) NOT NULL, payload bytea NOT NULL)')
                admin.execute(f'GRANT USAGE ON SCHEMA {schema} TO projection_reader')
                admin.execute(f'GRANT SELECT (id,body,embedding,count,amount,payload) ON {schema}.docs TO projection_reader')
            for schema, prefix in zip(schemas[:2], ('A', 'B'), strict=True):
                with admin.cursor() as cursor:
                    cursor.executemany(f'INSERT INTO {schema}.docs VALUES (%s,%s,%s::public.vector(3),%s,%s,%s)', [
                        (f'{prefix}{i:04}', f'e\u0301 and \u00e9 {i}', '[0.1,-0,1]', 2**63-1-i, amount, b'\x00\xff'+i.to_bytes(2, 'big')) for i in range(120)])
            try:
                with psycopg.connect(dsn, user='projection_reader', autocommit=True) as connection:
                    def target(schema, cls=PostgresTarget, conn=connection):
                        return cls(conn, PostgresConfiguration(schema, binding_digest(original['binding']), (180006,), timedelta(seconds=30)), tuple(getattr(queries, f'_Q{i}').variants[0].entry for i in range(3)))

                    connection.execute('SET search_path TO pg_catalog,sdk_projection_a,pg_temp')
                    try:
                        target('sdk_projection_a').verify()
                    except psycopg.errors.InsufficientPrivilege as error:
                        assert error.sqlstate == '42501' and 'table docs' in str(error)
                        assert connection.info.transaction_status == 0
                        passed('native-column-only-grants-refuse-original-LOCK')
                    else:
                        raise AssertionError('expected original native LOCK table privilege prerequisite')
                    for schema in schemas:
                        admin.execute(f'GRANT SELECT ON {schema}.docs TO projection_reader')
                    for schema in schemas[:2]:
                        connection.execute(f'SET search_path TO pg_catalog,{schema},pg_temp')
                        selected = target(schema)
                        selected.verify()
                        rows = queries.rows(selected)
                        oracle = connection.execute(f'SELECT id,body,embedding::pg_catalog.text,count,amount,payload FROM {schema}.docs ORDER BY id COLLATE "C"').fetchall()
                        expected = [(row[0],row[1],vector,row[3],row[4],row[5]) for row in oracle]
                        assert len(rows) == len(expected) == 120
                        assert [(r.id,r.body,r.embedding,r.count,r.amount,r.payload) for r in rows] == expected
                        assert queries.projected(selected) == expected
                        assert list(queries.pages_stream(selected, after=None, max_rows=121, page_size=7)) == expected
                        assert list(queries.pages_stream(selected, after=None, max_rows=120, page_size=11)) == expected
                        for maximum, truncated in ((3, True), (7, None)):
                            stream = queries.pages_stream(selected, after=None, max_rows=maximum, page_size=7)
                            emitted = []
                            try:
                                emitted.extend(stream)
                            except StreamLimitReached as error:
                                assert error.emitted == maximum and error.truncated is truncated
                            else:
                                raise AssertionError('stream limit silently returned')
                            assert emitted == expected[:maximum] and connection.info.transaction_status == 0
                        passed('native-full-model-tuple-stream-limits-and-exact-values-'+schema)
                    connection.execute('SET search_path TO pg_catalog,sdk_projection_a,pg_temp')
                    page = queries.pages(target('sdk_projection_a'), after=None)
                    connection.execute('SET search_path TO pg_catalog,sdk_projection_b,pg_temp')
                    try:
                        queries.pages(target('sdk_projection_b'), after=page.next_after)
                    except StaleContinuation:
                        passed('cross-schema-continuation-refused-on-same-catalog')
                    else:
                        raise AssertionError('cross-schema continuation admitted')
                    for schema in schemas[2:]:
                        connection.execute(f'SET search_path TO pg_catalog,{schema},pg_temp')
                        try:
                            queries.rows(target(schema))
                        except ReadObligationUnmet:
                            passed('native-empty-table-shape-refusal-'+schema)
                        else:
                            raise AssertionError('wrong native shape admitted on empty table')
                    connection.execute('SET search_path TO sdk_projection_a,pg_catalog,pg_temp')
                    try:
                        queries.rows(target('sdk_projection_a'))
                    except ReadObligationUnmet:
                        passed('native-pg-catalog-first-required')
                    else:
                        raise AssertionError('unsafe host path accepted')

                async def async_case():
                    async with await psycopg.AsyncConnection.connect(dsn, user='projection_reader', autocommit=True) as connection:
                        await connection.execute('SET search_path TO pg_catalog,sdk_projection_a,pg_temp')
                        selected = AsyncPostgresTarget(connection, PostgresConfiguration('sdk_projection_a', binding_digest(original['binding']), (180006,), timedelta(seconds=30)))
                        rows = await queries.rows(selected)
                        streamed = [row async for row in queries.pages_stream(selected, after=None, max_rows=121, page_size=11)]
                        assert [row.id for row in rows] == [row[0] for row in streamed]
                        emitted = []
                        try:
                            async for row in queries.pages_stream(selected, after=None, max_rows=3, page_size=7):
                                emitted.append(row)
                        except StreamLimitReached as error:
                            assert error.emitted == 3 and error.truncated is True
                        else:
                            raise AssertionError('async stream limit silently returned')
                        assert len(emitted) == 3 and connection.info.transaction_status == 0
                        assert len(await queries.rows(selected)) == 120
                asyncio.run(async_case())
                passed('native-async-full-shape-stream-bound-and-session-reuse')
                assert 'weft' not in sys.modules
                status = 'PASS'
            finally:
                for schema in schemas:
                    admin.execute(f'DROP SCHEMA {schema} CASCADE')
                admin.execute('DROP OWNED BY projection_reader')
                admin.execute('DROP ROLE projection_reader')
                cleanup = not admin.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=ANY(%s)', (list(schemas),)).fetchone()
                assert cleanup
                passed('native-fixture-role-and-grant-cleanup')
    finally:
        after = snapshot()
        (root / 'projection-result.json').write_text(json.dumps({'status': status if before == after and cleanup else 'FAILED',
            'checks': checks, 'installedBefore': before, 'installedAfter': after,
            'installedUnchanged': before == after, 'fixtureCleanupComplete': cleanup,
            'harnessSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'temporal': 'HELD'}, indent=2)+'\n')
        assert before == after


if __name__ == '__main__':
    main()

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit successor-only native search filter qualification campaign.

Requires freshly generated filter-parameters fixture and a source-owned fence
profile. No old profile is upgraded and no native compiler output is edited.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import subprocess
import sys
from datetime import timedelta
from decimal import Decimal
from importlib.metadata import version
from pathlib import Path

import psycopg
from umf_access.postgres_search import AsyncPostgresSearchTarget, PostgresSearchTarget
from umf_access.targets import PostgresConfiguration, binding_digest

ROOT = Path(__file__).resolve().parents[3]
GENERATED = Path(os.environ['UMF_FILTER_GENERATED_ROOT']).resolve()
OUT = Path(os.environ['UMF_FILTER_RECEIPTS']).resolve()
OUT.mkdir(parents=True, exist_ok=False)
sys.path.insert(0, str(GENERATED))
sys.path.insert(0, str(Path(__file__).resolve().parent))
PG = Path('/opt/homebrew/opt/postgresql@18/bin')
checks = []
started = False
admin = connection = None


def command(*args):
    result = subprocess.run([str(value) for value in args], capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


class CountingConnection(psycopg.Connection):
    executions = 0

    def execute(self, *args, **kwargs):
        self.executions += 1
        return super().execute(*args, **kwargs)


def s8(value, members):
    if not members:
        return False
    if value is None:
        return None
    return any(member is not None and value == member for member in members)


stage = json.loads((GENERATED / 'stage-one-request.json').read_text())
originals = {source['id']: source['text'] for source in stage['sources']}
model = stage['sources'][0]['text']
logical = json.loads(model)
assert logical['id'] == 'typed-search-filter-parameters'
access = logical['modules'][0]['extensions']['umf.access']
sets = []
for index, item in enumerate(access['columns']):
    alias = item['binding']['sourceId']
    source = originals[alias]
    sets.append({'columnSet': {'documentId': logical['id'], 'coreVersion': logical['umf'], 'documentSha256': hashlib.sha256(model.encode()).hexdigest(), 'module': 'search', 'pointer': f'/modules/0/extensions/umf.access/columns/{index}'}, 'binding': {'sourceId': alias, 'documentJson': source, 'documentSha256': hashlib.sha256(source.encode()).hexdigest()}})
binding = {'version': 'umf.raw-read-binding/0.1', 'schema': 'search_app', 'modelJson': model, 'modelSha256': hashlib.sha256(model.encode()).hexdigest(), 'tables': [{'logical': ['search', 'Doc'], 'native': 'docs', 'key': ['id'], 'columns': [{'logical': name, 'native': name, 'carrier': carrier, 'nullable': name == 'tag'} for name, carrier in [('id', 'string'), ('body', 'string'), ('owner', 'string'), ('count', 'integer'), ('amount', 'decimal'), ('tag', 'string'), ('flag', 'boolean')]]}], 'relationships': [], 'nativeColumns': {'target': {'platform': 'postgresql', 'majorVersion': '18'}, 'sets': sets, 'vectorExtension': {'schema': 'public', 'version': '0.8.7'}}, 'nativeCatalogFence': {'version': 'umf.pg-ts-fence/0.1', 'schema': 'native_fence', 'view': 'ts_catalog_lock', 'owner': 'fence_owner', 'ownerProfile': 'non-login-maintainer/0.1'}}
if os.environ.get('UMF_FILTER_STRICT_CONTEXT') == '1':
    binding.update(schema=None, schemaBinding='search-path')
config = {'package': 'search_docs', 'modules': ['search_filter_declarations'], 'weft': {'distribution': 'weft-sql', 'version': version('weft-sql')}, 'targets': [{'id': 'local', 'kind': 'postgresql', 'backendId': 'weft-postgresql', 'backendVersion': 'raw-read/0.1', 'targetProfile': 'weft.raw-read/0.1', 'binding': binding, 'platform': [{'name': 'postgresql', 'versions': ['180006']}], 'vectorBindings': [{'field': {'module': 'search', 'element': 'embedding'}, 'native': 'embedding', 'dimensions': 3, 'extensionSchema': 'public', 'extensionVersion': '0.8.7'}]}], 'umf': {'documents': []}}
for index, text in enumerate(originals.values()):
    name = f'filter-original-{index}.json'
    (GENERATED / name).write_text(text)
    config['umf']['documents'].append({'path': name, 'sha256': hashlib.sha256(text.encode()).hexdigest()})
(GENERATED / 'search_filter_declarations.py').write_bytes((ROOT / 'fixtures/access/search/filter-parameter-declarations.py').read_bytes())
(GENERATED / 'search-filter-config.json').write_text(json.dumps(config))
(OUT / 'public-cli.log').write_text(command(sys.executable, '-B', '-m', 'umf_access.build.catalog', 'catalog', '--config', GENERATED / 'search-filter-config.json', '--root', GENERATED))
from search_docs import queries

variants = tuple(variant for name, value in vars(queries).items() if name.startswith('_S') for variant in value.variants)
assert variants
for name, value in vars(queries).items():
    if not name.startswith('_S'):
        continue
    expected = {'string_list': 'string', 'string_not_list': 'string', 'integer_list': 'integer', 'decimal_list': 'decimal', 'boolean_list': 'boolean'}.get(value.name)
    for variant in value.variants:
        for entry in variant.entries:
            program = entry.artifact()
            slots = program['statement']['parameters']
            if expected is not None:
                slot = [item for item in slots if item['source'].get('input') == 'values']
                assert len(slot) == 1
                assert {key: slot[0].get(key) for key in ('carrier', 'container', 'nullable', 'elementNullable', 'maxItems')} == {'carrier': expected, 'container': 'list', 'nullable': False, 'elementNullable': True, 'maxItems': 1000}
            if value.name == 'nullable_scalar':
                slot = [item for item in slots if item['source'].get('input') == 'value']
                assert len(slot) == 1 and slot[0]['carrier'] == 'string' and slot[0]['nullable'] is True
checks.append({'kind': 'original-statement-full-filter-facets-before-native'})
artifacts = [entry.artifact() for variant in variants for entry in variant.entries]
fences = [artifact['obligations']['nativeCatalogFence'] for artifact in artifacts]
assert all(fence['deployment'] == fences[0]['deployment'] and fence['deploymentProgram'] == fences[0]['deploymentProgram'] for fence in fences)
(OUT / 'original-fence.json').write_text(json.dumps(fences[0], indent=2))
if os.environ.get('UMF_FILTER_BUILD_ONLY') == '1':
    print(json.dumps({'publicCliStatus': 'pass', 'nativeExecuted': False, 'temporal': 'HELD'}))
    raise SystemExit(0)

rows = [
    ('a', 'cats running red', '[1,0,0]', 'search_user', 9223372036854775807, Decimal('1234567890123456789012345678.1234567890'), b'a', 'é%\\', True),
    ('b', 'cats blue', '[0,1,0]', 'search_user', -9223372036854775808, Decimal('-1234567890123456789012345678.1234567890'), b'b', 'other', False),
    ('c', 'cats red blue', '[0,0,1]', 'search_user', 0, Decimal(0), b'c', None, True),
    ('hidden', 'cats running red', '[1,0,0]', 'hidden_user', 9223372036854775807, Decimal('1234567890123456789012345678.1234567890'), b'hidden', 'é%\\', True),
]
try:
    (OUT / 'socket').mkdir()
    command(PG / 'initdb', '-D', OUT / 'data', '-U', 'sdk_test', '-A', 'trust', '--no-sync')
    control = Path(os.environ['UMF_PGVECTOR_CONTROL_ROOT']).resolve()
    assert not any(char.isspace() for char in str(control))
    command(PG / 'pg_ctl', '-D', OUT / 'data', '-l', OUT / 'server.log', '-o', f"-F -k {OUT / 'socket'} -c listen_addresses='' -c extension_control_path={control} -p 55513", '-w', 'start')
    started = True
    dsn = f"host={OUT / 'socket'} port=55513 dbname=postgres"
    admin = psycopg.connect(dsn + ' user=sdk_test', autocommit=True)
    assert admin.info.server_version == 180006
    admin.execute("CREATE EXTENSION vector VERSION '0.8.7'")
    admin.execute('CREATE ROLE search_user LOGIN NOSUPERUSER NOBYPASSRLS')
    from pg_fence_e2e_support import deploy_owned_fence
    deployment_receipt = deploy_owned_fence(admin, artifacts)
    (OUT / "fence-deployment-receipt.json").write_text(json.dumps(deployment_receipt, indent=2))
    admin.execute('CREATE SCHEMA search_app')
    admin.execute('GRANT USAGE ON SCHEMA search_app TO search_user')
    admin.execute('CREATE TABLE search_app.docs(id text COLLATE "C" PRIMARY KEY,body text COLLATE "C" NOT NULL,embedding public.vector(3) NOT NULL,owner text NOT NULL,count bigint NOT NULL,amount numeric(38,10) NOT NULL,payload bytea NOT NULL,tag text COLLATE "C",flag boolean NOT NULL)')
    for row in rows:
        admin.execute('INSERT INTO search_app.docs VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)', row)
    admin.execute("CREATE INDEX doc_text ON search_app.docs USING gin(pg_catalog.to_tsvector('pg_catalog.english'::pg_catalog.regconfig,COALESCE(body,''::text)))")
    admin.execute('CREATE INDEX doc_semantic ON search_app.docs USING hnsw(embedding public.vector_cosine_ops)')
    admin.execute('ALTER TABLE search_app.docs ENABLE ROW LEVEL SECURITY')
    admin.execute('CREATE POLICY own_rows ON search_app.docs USING(owner=current_user)')
    admin.execute('GRANT SELECT ON search_app.docs TO search_user')
    connection = CountingConnection.connect(dsn + ' user=search_user')
    if os.environ.get('UMF_FILTER_STRICT_CONTEXT') == '1':
        connection.execute('SET search_path TO pg_catalog, search_app, pg_temp')
        connection.commit()
    configuration = PostgresConfiguration('search_app', binding_digest(binding), (180006,), timedelta(seconds=5))
    target = PostgresSearchTarget(connection, configuration, search_variants=variants)
    target.verify()

    def identities(result):
        assert connection.info.transaction_status == 0
        return sorted(hit.item.id for hit in result)

    for function, offset, values in [
        ('string_list', 7, []), ('string_list', 7, [None]), ('string_list', 7, [None, 'é%\\']), ('string_list', 7, ['missing', None]),
        ('string_not_list', 7, []), ('string_not_list', 7, [None]), ('string_not_list', 7, [None, 'é%\\']),
        ('integer_list', 4, [None, 9223372036854775807]), ('integer_list', 4, [-9223372036854775808, 0]), ('integer_list', 4, [10**80, None]),
        ('decimal_list', 5, [None, rows[0][5]]), ('decimal_list', 5, [rows[1][5], Decimal(0)]),
        ('boolean_list', 8, [None, True]), ('boolean_list', 8, [False]), ('string_list', 7, ['other'] * 1000),
    ]:
        expected = []
        for row in rows[:3]:
            accepted = s8(row[offset], values)
            if function == 'string_not_list' and accepted is not None:
                accepted = not accepted
            if accepted is True:
                expected.append(row[0])
        actual = identities(getattr(queries, function)(target, term='cats', values=values))
        assert actual == sorted(expected), (function, values, expected, actual)
        checks.append({'kind': function, 'members': len(values), 'expected': sorted(expected), 'actual': actual})
    for value, expected in [(None, []), ('é%\\', ['a']), ('missing', [])]:
        assert identities(queries.nullable_scalar(target, term='cats', value=value)) == expected
        checks.append({'kind': 'nullable-scalar', 'valueIsNull': value is None, 'expected': expected})
    for function, arguments, expected in [('literal_empty', {}, []), ('literal_nulls', {}, ['a']), ('all_terms', {'words': 'red blue'}, ['c']), ('any_terms', {'words': 'red blue'}, ['a','b','c'])]:
        assert identities(getattr(queries, function)(target, term='cats', **arguments)) == expected
        checks.append({'kind': function, 'expected': expected})
    for function, values in [('string_list', ['other'] * 1001), ('integer_list', [True]), ('decimal_list', [1]), ('boolean_list', [1]), ('string_list', [1])]:
        before_dispatch = connection.executions
        try:
            getattr(queries, function)(target, term='cats', values=values)
        except (TypeError, ValueError):
            pass
        else:
            raise AssertionError('invalid authored parameter domain accepted')
        assert connection.info.transaction_status == 0 and connection.executions == before_dispatch
        checks.append({'kind': 'invalid-domain-before-transaction', 'query': function, 'nativeStatementsDispatched': 0})

    async def async_controls():
        async_connection = await psycopg.AsyncConnection.connect(dsn + ' user=search_user')
        try:
            if os.environ.get('UMF_FILTER_STRICT_CONTEXT') == '1':
                await async_connection.execute('SET search_path TO pg_catalog, search_app, pg_temp')
                await async_connection.commit()
            async_target = AsyncPostgresSearchTarget(async_connection, configuration, search_variants=variants)
            result = await queries.string_list(async_target, term='cats', values=[None, 'é%\\'])
            assert sorted(hit.item.id for hit in result) == ['a']
            result = await queries.nullable_scalar(async_target, term='cats', value=None)
            assert len(result) == 0 and async_connection.info.transaction_status == 0
        finally:
            await async_connection.close()
    asyncio.run(async_controls())
    checks.append({'kind': 'actual-async-list-nullable-parity'})
    if os.environ.get('UMF_FILTER_STRICT_CONTEXT') == '1':
        from pg_ranked_strict_context_e2e import exercise_ranked_strict_context
        checks.extend(exercise_ranked_strict_context(queries, configuration, admin, dsn))
    else:
        from pg_search_fence_e2e import exercise_fence
        checks.extend(exercise_fence(queries, configuration, admin, dsn))
    (OUT / 'result.json').write_text(json.dumps({'status': 'pass', 'checks': checks, 'temporal': 'HELD', 'nativeAuthority': False, 'scope': 'owned PostgreSQL18.6/pgvector0.8.7 actual generated search filters only'}, indent=2))
finally:
    if connection is not None:
        connection.close()
    if admin is not None:
        admin.close()
    if started:
        command(PG / 'pg_ctl', '-D', OUT / 'data', '-m', 'fast', '-w', 'stop')
    assert not (OUT / 'data/postmaster.pid').exists()
    print(json.dumps({'ownedServerStopped': True, 'checks': len(checks)}))

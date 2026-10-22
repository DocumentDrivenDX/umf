# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused local PG18 qualification for compiler-owned set INSERT batches."""
import argparse
import asyncio
import copy
import json
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
from psycopg import sql
from umf_access.lifecycle import apply_table_migration
from umf_access.unified import (
    AsyncSession,
    AsyncTableWriter,
    SessionError,
    SessionIdentity,
    SessionPolicy,
    SyncSession,
    SyncTableWriter,
)
from umf_codegen import compile_table_deployment, compile_table_migration

parser = argparse.ArgumentParser()
parser.add_argument('--dsn', required=True)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--report', type=Path, required=True)
parser.add_argument('--oversize-only', action='store_true')
args = parser.parse_args()
checks, cases = [], []


def check(label, condition):
    assert condition, label
    checks.append(label)


def qualify(numeric, oversized=False, silent=False, generated=False):
    source = json.loads(args.source.read_text())
    module = source['modules'][0]
    payload = module['extensions']['umf.tables']
    table = payload['tables'][0]
    prefix = 'bulk_' + uuid4().hex[:12] + '_'
    cfg = {'module': 'demo', 'schema': prefix+'schema', 'ownerRole': prefix+'owner',
           'personRole': prefix+'person', 'batchRole': prefix+'batch', 'groupRoles': {}}
    alice, bob = prefix+'alice', prefix+'bob'
    roles = [cfg['ownerRole'], cfg['personRole'], cfg['batchRole'], alice, bob]
    table['policy']['batch']['insert'] = {'kind': 'allow'}
    table['policy']['batch']['update'] = {'kind': 'allow'}
    command = next(c for c in payload['commands'] if c['id'] == 'create_batch')
    command['batch']['maxItems'] = 1000
    upsert = copy.deepcopy(next(c for c in payload['commands'] if c['id'] == 'put_update'))
    upsert.update(id='put_update_batch', batch={'maxItems': 2})
    payload['commands'].append(upsert)
    if numeric:
        module['elements'][0]['scalarType'] = 'decimal'
        module['elements'][0]['facets'] = {'precision': 14, 'scale': 2}
        table['columns'][0]['nativeType'] = {'kind': 'numeric', 'precision': 14, 'scale': 2}
    fixed = copy.deepcopy(command)
    fixed['id'] = 'create_fixed'
    fixed['parameters'] = [p for p in fixed['parameters'] if p['id'] == 'id']
    fixed['body']['values'][1]['value'] = {
        'kind': 'literal',
        'value': {'string': 'x'*1_000_000 if oversized else cfg['batchRole']},
    }
    payload['commands'].append(fixed)
    principal = copy.deepcopy(fixed)
    principal['id'] = 'create_principal'
    principal['body']['values'][1]['value'] = {'kind': 'currentPrincipal'}
    payload['commands'].append(principal)
    silent_command = copy.deepcopy(command)
    silent_command['id'] = 'create_silent'
    silent_command['body']['returning'] = []
    payload['commands'].append(silent_command)
    if silent:
        for audience in ('person', 'batch'):
            table['policy'][audience].update(select={'kind': 'deny'}, update={'kind': 'deny'}, delete={'kind': 'deny'})
    if generated:
        module['elements'][0]['scalarType'] = 'uuid'
        table['columns'][0].update(nativeType={'kind': 'uuid'}, default={'kind': 'randomUuid'})
        table['columns'][1]['default'] = {'kind': 'literal', 'value': {'string': cfg['batchRole']}}
        at = {'module': 'demo', 'element': 'at'}
        module['elements'].append({'id': 'at', 'kind': 'field', 'scalarType': 'timestamp',
                                   'cardinality': 'one', 'nullability': 'required', 'extensions': {}})
        next(element for element in module['elements'] if element['kind'] == 'record')['members'].append(at)
        table['columns'].append({'field': at, 'name': 'at', 'nativeType': {'kind': 'timestamptz'},
                                 'default': {'kind': 'currentTimestamp'}})
        generated_command = copy.deepcopy(command)
        generated_command['id'] = 'create_generated'
        generated_command['parameters'] = [p for p in generated_command['parameters'] if p['id'] == 'owner']
        generated_command['body']['values'] = [v for v in generated_command['body']['values'] if v['field']['element'] == 'owner']
        payload['commands'].append(generated_command)
        clock = copy.deepcopy(generated_command)
        clock['id'] = 'create_clock'
        clock['parameters'] = []
        clock['body']['values'] = [{'field': at, 'value': {'kind': 'currentTimestamp'}}]
        clock['body']['returning'].append(at)
        payload['commands'].append(clock)
    text = json.dumps(source, separators=(',', ':'))
    deployment = compile_table_deployment(text=text, configuration=cfg)
    assert deployment['status'] == 'compiled', deployment
    bundle = deployment['bundle']
    migration = compile_table_migration(migration_id='001', predecessor=None,
                                       previous_bundle=None, next_bundle=bundle)
    assert migration['status'] == 'compiled', migration
    binding = {'version': 'umf.raw-read-binding/0.1', 'schema': cfg['schema'],
               'modelJson': text, 'modelSha256': bundle['sourceDigest'],
               'tables': [{'logical': ['demo', 'Note'], 'native': 'notes', 'key': ['id'],
                           'columns': [{'logical': column['field']['element'], 'native': column['name'],
                                        'carrier': next(field['scalarType'] for field in module['elements'] if field['id'] == column['field']['element']),
                                        'nullable': False} for column in table['columns']]}],
               'relationships': [], 'nativeLifecycle': {'version': 'umf.table-lifecycle/0.1',
                   'module': 'demo', 'configurationDigest': bundle['configurationDigest'],
                   'deploymentDigest': bundle['bundleDigest']}}
    policy = SessionPolicy({'alice': alice, 'bob': bob}, {'job': cfg['batchRole']},
                           cfg['schema'], catalog_only=True)
    person, job = SessionIdentity('person', 'alice'), SessionIdentity('batch', 'job')
    secret = b'public synthetic batch test secret 000000'
    mutation_sql, trace, leases = set(), [], {'acquired': 0, 'released': 0}

    class TraceCursor(psycopg.Cursor):
        def execute(self, query, params=None, **options):
            if isinstance(query, str) and query in mutation_sql:
                trace.append('sync')
            return super().execute(query, params, **options)

    class AsyncTraceCursor(psycopg.AsyncCursor):
        async def execute(self, query, params=None, **options):
            if isinstance(query, str) and query in mutation_sql:
                trace.append('async')
            return await super().execute(query, params, **options)

    @contextmanager
    def factory(_identity):
        with psycopg.connect(args.dsn, cursor_factory=TraceCursor) as connection:
            leases['acquired'] += 1
            try:
                yield connection
            finally:
                leases['released'] += 1

    @asynccontextmanager
    async def async_factory(_identity):
        async with await psycopg.AsyncConnection.connect(args.dsn, cursor_factory=AsyncTraceCursor) as connection:
            leases['acquired'] += 1
            try:
                yield connection
            finally:
                leases['released'] += 1

    def items(values, owner=cfg['batchRole']):
        return [{'id': {'decimalToken' if numeric else 'string': str(value)},
                 'owner': {'string': owner}} for value in values]

    def remember(writer, operation, batch, key, eligible=True):
        program = writer._write_prepare(job, operation, None, key, batch)[1]
        variant = program.get('nativeBatch')
        check('native-variant-selection', bool(variant) == eligible)
        mutation_sql.add(variant['dbapiSql'] if variant else program['dbapiSql'])
        return program

    with psycopg.connect(args.dsn, autocommit=True) as admin:
        created, schema_created = [], False
        try:
            for role in roles:
                admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS').format(sql.Identifier(role)))
                created.append(role)
            for role in (alice, bob):
                admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE, SET FALSE').format(sql.Identifier(cfg['personRole']), sql.Identifier(role)))
            admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']), sql.Identifier(cfg['ownerRole'])))
            schema_created = True
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
                admin.execute('SET LOCAL search_path=pg_catalog')
                reference = apply_table_migration(admin, migration['plan'], approved_digest=migration['plan']['digest'],
                                                 expected_head=None, person_roles=(alice, bob))['installationReference']
            writer = SyncTableWriter(SyncSession(factory, policy), bundle, reference, binding, outcome_secret=secret)
            if silent:
                batch = items(['1', '2'])
                remember(writer, 'create_silent', batch, 'silent')
                before = len(trace)
                result = writer.write_batch(job, 'create_silent', batch, key='silent')
                check('silent-one-command', len(trace)-before == 1)
                check('silent-effect-counts', result['receipt']['effects'] == [{'integerToken': '1'}]*2)
                check('silent-no-business-row-invention', all(frame['rows'] == [] for frame in result['result']['items']))
                check('silent-no-select-grant', admin.execute('SELECT has_table_privilege(%s,%s,%s)', (cfg['batchRole'], cfg['schema']+'.notes', 'SELECT')).fetchone() == (False,))
                check('silent-leases-returned', leases['acquired'] == leases['released'])
                cases.append({'noSelectGrant': True, 'emptyProjection': True, 'rows': 2,
                              'postgresql': admin.info.server_version, 'leases': leases})
                return
            if generated:
                batch = [{'owner': {'string': value}} for value in ['first', 'second', 'third']]
                remember(writer, 'create_generated', batch, 'generated')
                before = len(trace)
                result = writer.write_batch(job, 'create_generated', batch, key='generated')
                rows = [frame['rows'][0] for frame in result['result']['items']]
                check('generated-keys-one-command', len(trace)-before == 1)
                check('generated-keys-ordered-owners', [row['owner'] for row in rows] == ['first', 'second', 'third'])
                check('generated-keys-unique-uuid', len({UUID(row['id']['uuid']) for row in rows}) == 3)
                clock_items = [{}, {}]
                clock_program = remember(writer, 'create_clock', clock_items, 'clock')
                check('clock-has-zero-native-slots', clock_program['parameterSources'] == [])
                before = len(trace)
                clock_result = writer.write_batch(job, 'create_clock', clock_items, key='clock')
                clock_rows = [frame['rows'][0] for frame in clock_result['result']['items']]
                check('zero-slot-clock-one-command', len(trace)-before == 1)
                check('zero-slot-default-owner', all(row['owner'] == cfg['batchRole'] for row in clock_rows))
                check('zero-slot-transaction-clock', len({row['at']['timestamp'] for row in clock_rows}) == 1)
                check('generated-keys-leases-returned', leases['acquired'] == leases['released'])
                cases.append({'generatedUuidKeys': True, 'rows': 3,
                              'postgresql': admin.info.server_version, 'leases': leases})
                return
            if oversized:
                batch = [{'id': {'string': str(i)}} for i in range(9)]
                remember(writer, 'create_fixed', batch, 'oversize')
                before = len(trace)
                try:
                    writer.write_batch(job, 'create_fixed', batch, key='oversize')
                except SessionError as error:
                    states = []
                    while error is not None:
                        states.append(getattr(error, 'sqlstate', None))
                        error = error.__context__
                    check('native-byte-bound-sqlstate', '22012' in states)
                else:
                    raise AssertionError('oversized native frame accepted')
                check('oversize-one-native-command', len(trace)-before == 1)
                relation = sql.Identifier(cfg['schema'], 'notes')
                check('oversize-all-effects-rollback', admin.execute(sql.SQL('SELECT count(*) FROM {}').format(relation)).fetchone()[0] == 0)
                check('oversize-no-receipt', writer.observe_batch(job, 'create_fixed', batch, key='oversize')['status'] == 'not-observed')
                check('oversize-leases-returned', leases['acquired'] == leases['released'])
                cases.append({'oversizedFrame': True, 'rows': 9, 'logicalReturnBytes': 9_000_000,
                              'postgresql': admin.info.server_version, 'leases': leases})
                return
            count = 3 if numeric else 1000
            values = [str((i*37) % count + 1) for i in range(count)]
            batch = items(values)
            remember(writer, 'create_batch', batch, 'bulk')
            before = len(trace)
            result = writer.write_batch(job, 'create_batch', batch, key='bulk')
            check('one-native-command', len(trace)-before == 1)
            check('ordered-effects', result['receipt']['effects'] == [{'integerToken': '1'}]*count)
            actual = [row['rows'][0]['id'] for row in result['result']['items']]
            expected = [Decimal(value) for value in values] if numeric else values
            actual = [Decimal(value['decimalToken']) for value in actual] if numeric else actual
            check('ordered-returned-keys', actual == expected)
            before = len(trace)
            check('durable-replay', writer.write_batch(job, 'create_batch', batch, key='bulk')['status'] == 'recovered')
            check('replay-has-no-mutation-command', len(trace) == before)
            duplicate = items(['10001', '10001'])
            remember(writer, 'create_batch', duplicate, 'duplicate')
            try:
                writer.write_batch(job, 'create_batch', duplicate, key='duplicate')
            except SessionError:
                pass
            else:
                raise AssertionError('duplicate key accepted')
            relation = sql.Identifier(cfg['schema'], 'notes')
            check('duplicate-rollback', admin.execute(sql.SQL('SELECT count(*) FROM {}').format(relation)).fetchone()[0] == count)
            check('duplicate-no-receipt', writer.observe_batch(job, 'create_batch', duplicate, key='duplicate')['status'] == 'not-observed')
            denied = items(['10002'], alice) + items(['10003'], bob)
            remember(writer, 'create_batch', denied, 'denied')
            try:
                writer.write_batch(person, 'create_batch', denied, key='denied')
            except SessionError:
                pass
            else:
                raise AssertionError('mixed-owner batch accepted')
            check('policy-rollback', admin.execute(sql.SQL('SELECT count(*) FROM {}').format(relation)).fetchone()[0] == count)
            fixed_items = [{'id': item['id']} for item in items(['10004', '10005'])]
            remember(writer, 'create_fixed', fixed_items, 'fixed')
            before = len(trace)
            fixed_result = writer.write_batch(job, 'create_fixed', fixed_items, key='fixed')
            check('fixed-literal-one-command', len(trace)-before == 1)
            check('fixed-literal-results', all(row['rows'][0]['owner'] == cfg['batchRole'] for row in fixed_result['result']['items']))
            principal_items = [{'id': item['id']} for item in items(['10010', '10011'])]
            remember(writer, 'create_principal', principal_items, 'principal')
            before = len(trace)
            principal_result = writer.write_batch(job, 'create_principal', principal_items, key='principal')
            check('principal-one-command', len(trace)-before == 1)
            check('principal-from-active-role', all(row['rows'][0]['owner'] == cfg['batchRole'] for row in principal_result['result']['items']))
            upserts = items(['10006'], alice) + items(['10006'], bob)
            remember(writer, 'put_update_batch', upserts, 'upserts', eligible=False)
            before = len(trace)
            upsert_result = writer.write_batch(job, 'put_update_batch', upserts, key='upserts')
            check('upsert-keeps-sequential-commands', len(trace)-before == 2)
            check('upsert-keeps-sequential-results', [row['rows'][0]['owner'] for row in upsert_result['result']['items']] == [alice, bob])

            async def async_case():
                async_writer = AsyncTableWriter(AsyncSession(async_factory, policy), bundle, reference, binding, outcome_secret=secret)
                async_items = items(['10007', '10008', '10009'])
                remember(async_writer, 'create_batch', async_items, 'async')
                before = len(trace)
                response = await async_writer.write_batch(job, 'create_batch', async_items, key='async')
                check('async-one-command', len(trace)-before == 1)
                check('async-effects', response['receipt']['effects'] == [{'integerToken': '1'}]*3)

            asyncio.run(async_case())
            check('leases-returned', leases['acquired'] == leases['released'])
            cases.append({'numericKey': numeric, 'batchSize': count, 'postgresql': admin.info.server_version,
                          'sourceDigest': bundle['sourceDigest'], 'leases': leases,
                          'mutationCommands': len(trace)})
        finally:
            if schema_created:
                admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
            for role in reversed(created):
                admin.execute(sql.SQL('DROP OWNED BY {}').format(sql.Identifier(role)))
            for role in reversed(created):
                admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))


if args.oversize_only:
    qualify(False, oversized=True)
else:
    qualify(False)
    qualify(True)
    qualify(False, silent=True)
    qualify(False, generated=True)
args.report.write_text(json.dumps({'cases': cases, 'assertions': checks, 'scope': 'local macOS PG18 set INSERT component'}, indent=2)+'\n')
print(json.dumps({'cases': len(cases), 'assertions': len(checks)}))

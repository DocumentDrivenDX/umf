# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generated original-source related target sets through installed compiler and PG18.

Caller owns PG. Only the dedicated fixture schema is created and removed.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import sysconfig
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

import psycopg

DECLARATIONS = '''from alias_shop import Order, OrderKey
from umf_access.dsl import query, Param
@query
def direct(minimum: Param[int]):
    return Order.objects.filter(Order.c.revision > minimum).related(Order.c.parent).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def source_limited():
    return Order.objects.order_by(Order.c.order_id.asc()).limit(2).related(Order.c.parent).select(Order.c.order_id).order_by(Order.c.order_id.desc()).limit(20).all()
@query
def inverse():
    return Order.objects.filter(Order.c.order_id=='b').related(Order.c.parent.inverse()).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def target_filtered():
    return Order.objects.related(Order.c.parent).filter(Order.c.order_id!='c').select(Order.c.order_id).order_by(Order.c.order_id.desc()).limit(1).all()
@query
def target_count():
    return Order.objects.related(Order.c.parent).count()
@query
def empty():
    return Order.objects.filter(Order.c.order_id=='absent').related(Order.c.parent).select(Order.c.order_id).limit(20).all()
@query
def pages(after: Param[OrderKey | None]):
    return Order.objects.related(Order.c.parent).select(Order.c.order_id).order_by(Order.c.order_id.asc()).page(size=2,after=after)
'''


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    harness = Path(__file__).resolve()
    generator = harness.parents[3] / 'scripts/generate-access-alias-fixture.ts'
    schema = 'sdk_related_fixture'
    dsn = os.environ['UMF_PG_TEST_DSN']
    site = Path(sysconfig.get_path('purelib')) / 'umf_access'
    excluded = {'queries.py', '_umf/catalog.json', '_umf/catalog-manifest.json', '_umf/privileges.json'}

    def snapshot():
        return {'harness': hashlib.sha256(harness.read_bytes()).hexdigest(),
                'generator': hashlib.sha256(generator.read_bytes()).hexdigest(),
                'stageOneRequest': hashlib.sha256((root/'stage-one-request.json').read_bytes()).hexdigest(),
                'stageOneFiles': {str(p.relative_to(root/'alias_shop')): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'alias_shop').rglob('*')) if p.is_file() and '__pycache__' not in p.parts and str(p.relative_to(root/'alias_shop')) not in excluded},
                'installedRuntime': {str(p.relative_to(site)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(site.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}}

    start = snapshot()
    status, checks, version = 'FAILED', [], None
    created, cleaned = False, False
    request = json.loads((root/'stage-one-request.json').read_text())
    model = request['sources'][0]['text']
    binding = {'version': 'umf.raw-read-binding/0.1', 'schema': None, 'modelJson': model,
               'modelSha256': hashlib.sha256(model.encode()).hexdigest(),
               'tables': [{'logical': ['commerce','Order'], 'native': 'orders', 'key': ['orderId'],
                           'columns': [{'logical': n, 'native': n, 'carrier': c, 'nullable': nullable} for n,c,nullable in [('orderId','string',False),('amount','decimal',True),('revision','integer',True),('memo','string',True),('parentId','string',True),('peerId','string',False)]]}],
               'relationships': [{'id':name,'source':['commerce','Order'],'target':['commerce','Order'],'pairs':[[name+'Id','orderId']],'toOne':True} for name in ('parent','peer')]}
    (root/'related_declarations.py').write_text(DECLARATIONS)

    def case(name):
        checks.append(name)
        print('PASS', name, flush=True)

    try:
        with psycopg.connect(dsn, autocommit=True) as connection:
            version = connection.info.server_version
            assert 180000 <= version < 190000
            assert not connection.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s', (schema,)).fetchone(), 'fixture exists; refusing replacement'
            config = {'package':'alias_shop','modules':['related_declarations'],'targets':[{'id':'local','kind':'postgresql','backendId':'weft-postgresql','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','binding':binding,'platform':[{'name':'postgresql','versions':[str(version)]}]}]}
            (root/'config.json').write_text(json.dumps(config,indent=2)+'\n')
            for suffix in ((),('--check',)):
                cli = subprocess.run([sys.executable,'-I','-B','-m','umf_access.build.catalog','catalog','--config',str(root/'config.json'),'--root',str(root),*suffix],capture_output=True,text=True,check=False)
                (root/('cli-check.log' if suffix else 'cli-generate.log')).write_text(cli.stdout+cli.stderr)
                assert cli.returncode == 0, cli.stdout+cli.stderr
            case('actual-public-cli-and-drift-check')
            sys.path.insert(0,str(root))
            from alias_shop import queries
            from umf_access.targets import (
                PostgresConfiguration,
                PostgresTarget,
                binding_digest,
            )
            entries = tuple(v.entry for i in range(7) for v in getattr(queries,'_Q'+str(i)).variants)
            for entry in entries:
                artifact=entry.artifact()
                assert artifact['relatedRequest']['relationship']['module']=='commerce'
                assert artifact['sourceSql']==artifact['relatedRequest']['target']['sql']
            case('original-source-target-relationship-packet-custody')
            connection.execute(f'CREATE SCHEMA {schema}')
            created = True
            try:
                connection.execute(f'CREATE TABLE {schema}.orders ("orderId" text PRIMARY KEY,amount numeric(40,20),revision bigint,memo text,"parentId" text,"peerId" text NOT NULL)')
                with connection.cursor() as cursor:
                    cursor.executemany(f'INSERT INTO {schema}.orders VALUES (%s,%s,%s,%s,%s,%s)', [('a2',Decimal('1.50'),15,None,'b','d'),('a',Decimal('1.25'),10,None,'b','c'),('b',Decimal('2.50'),20,None,'c','d'),('c',Decimal('3.75'),30,None,'d','a'),('d',Decimal('4.00'),40,None,None,'b'),('leaf',Decimal('5.00'),50,None,None,'c')])
                target = PostgresTarget(connection, PostgresConfiguration(schema,binding_digest(binding),(version,),timedelta(seconds=20)), entries)
                target.verify()
                case('original-native-admission')
                oracle = connection.execute(f'SELECT t."orderId" FROM {schema}.orders t WHERE EXISTS (SELECT 1 FROM {schema}.orders s WHERE s.revision > %s AND s."parentId"=t."orderId") ORDER BY t."orderId" COLLATE "C"',(0,)).fetchall()
                assert oracle==[('b',),('c',),('d',)],oracle
                assert queries.direct(target,minimum=0)==oracle
                case('forward-deduplicated-target-set-independent-native-exists')
                assert queries.source_limited(target)==[('b',)]
                case('source-order-limit-before-target-dedup')
                assert queries.inverse(target)==[('a',),('a2',)]
                case('inverse-original-directed-relationship-child-target-set')
                assert queries.target_filtered(target)==[('d',)]
                case('target-filter-order-limit-after-source-exists')
                assert queries.target_count(target)==3
                case('aggregate-count-after-native-target-set-dedup')
                assert queries.empty(target)==[]
                case('empty-source-target-set')
                first=queries.pages(target,after=None)
                assert first.items==(('b',),('c',)) and first.next_after is not None, first
                second=queries.pages(target,after=first.next_after)
                assert second.items==(('d',),) and second.next_after is None, second
                case('selected-target-keyset-continuation-after-dedup')
                assert list(queries.pages_stream(target,after=None,max_rows=10,page_size=1))==[('b',),('c',),('d',)]
                case('original-owner-stream-size-on-target-set')
            finally:
                connection.execute(f'DROP SCHEMA {schema} CASCADE')
                cleaned = True
            assert not connection.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s',(schema,)).fetchone()
            case('native-fixture-cleanup')
            status = 'PASS'
    finally:
        end = snapshot()
        receipt = {'status':status if start==end and (not created or cleaned) else 'FAILED','checks':checks,'serverVersion':version,'temporal':'HELD','sourceStart':start,'sourceEnd':end,'sourceUnchanged':start==end,'fixtureCleanupComplete':not created or cleaned}
        (root/'related-result.json').write_text(json.dumps(receipt,indent=2)+'\n')
        if start != end:
            raise AssertionError('source changed during related qualification')
        if created and not cleaned:
            raise AssertionError('native related fixture cleanup incomplete')


if __name__ == '__main__':
    main()

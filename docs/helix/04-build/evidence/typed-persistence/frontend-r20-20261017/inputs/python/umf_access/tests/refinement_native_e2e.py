"""Generated self/repeated-owner aliases through installed compiler and PG18.

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

DECLARATIONS = '''from refinement_shop import Order
from umf_access.dsl import query,sum_,count
class First:
    pass
class Second:
    pass
class Third:
    pass
class Root:
    pass
one, two, three = Order.alias(First), Order.alias(Second), Order.alias(Third)
root = Order.alias(Root)
@query
def repeated():
    return Order.objects.join(Order.c.parent.to_alias(one),how='inner').join(one.c.parent.to_alias(two),how='inner').join(two.c.parent.to_alias(three),how='inner').select(Order.c.order_id, one.c.order_id, two.c.order_id, three.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def mixed():
    return Order.objects.filter(Order.c.order_id=='leaf').join(Order.c.parent.to_alias(one), how='left').join(Order.c.peer.to_alias(two)).select(one.c.order_id, two.c.order_id).order_by(two.c.order_id.asc()).limit(10).all()
@query
def grouped():
    return Order.objects.join(Order.c.parent.to_alias(one),how='inner').group_by(one.c.revision).select(one.c.revision,sum_(Order.c.amount),count()).order_by(one.c.revision.asc()).limit(10).all()
@query
def aliased_root():
    return root.objects.select(root.c.order_id,root.c.revision).order_by(root.c.order_id.asc()).limit(10).all()
@query
def wrong_alias_projection():
    return Order.objects.join(Order.c.parent.to_alias(one),how='inner').join(one.c.parent.to_alias(two),how='inner').join(two.c.parent.to_alias(three),how='inner').select(Order.c.order_id,Order.c.order_id,Order.c.order_id,Order.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def refine_direct():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.peer.to_alias(two)).select(Order.c.order_id,one.c.order_id,two.c.order_id,one.c.revision).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def refine_ancestors():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.parent.to_alias(two)).join(two.c.peer.to_alias(three)).select(Order.c.order_id,one.c.order_id,two.c.order_id,three.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def refine_sibling():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(Order.c.optional_peer.to_alias(two)).join(one.c.peer.to_alias(three)).select(Order.c.order_id,one.c.order_id,two.c.order_id,three.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def refine_descendant():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.parent.to_alias(two)).join(one.c.peer.to_alias(three)).select(Order.c.order_id,one.c.order_id,two.c.order_id,three.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
'''


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    harness = Path(__file__).resolve()
    generator = harness.parents[3] / 'scripts/generate-access-refinement-fixture.ts'
    schema = 'sdk_refinement_fixture'
    dsn = os.environ['UMF_PG_TEST_DSN']
    site = Path(sysconfig.get_path('purelib')) / 'umf_access'
    excluded = {'queries.py', '_umf/catalog.json', '_umf/catalog-manifest.json', '_umf/privileges.json'}

    def snapshot():
        return {'harness': hashlib.sha256(harness.read_bytes()).hexdigest(),
                'generator': hashlib.sha256(generator.read_bytes()).hexdigest(),
                'stageOneRequest': hashlib.sha256((root/'stage-one-request.json').read_bytes()).hexdigest(),
                'stageOneFiles': {str(p.relative_to(root/'refinement_shop')): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'refinement_shop').rglob('*')) if p.is_file() and '__pycache__' not in p.parts and str(p.relative_to(root/'refinement_shop')) not in excluded},
                'installedRuntime': {str(p.relative_to(site)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(site.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}}

    start = snapshot()
    status, checks, version = 'FAILED', [], None
    created, cleaned = False, False
    request = json.loads((root/'stage-one-request.json').read_text())
    model = request['sources'][0]['text']
    binding = {'version': 'umf.raw-read-binding/0.1', 'schema': None, 'modelJson': model,
               'modelSha256': hashlib.sha256(model.encode()).hexdigest(),
               'tables': [{'logical': ['commerce','Order'], 'native': 'orders', 'key': ['orderId'],
                           'columns': [{'logical': n, 'native': n, 'carrier': c, 'nullable': nullable} for n,c,nullable in [('orderId','string',False),('amount','decimal',True),('revision','integer',True),('memo','string',True),('parentId','string',True),('peerId','string',False),('optionalPeerId','string',True)]]}],
               'relationships': [{'id':name,'source':['commerce','Order'],'target':['commerce','Order'],'pairs':[[name+'Id','orderId']],'toOne':True} for name in ('parent','peer','optionalPeer')]}
    (root/'refinement_declarations.py').write_text(DECLARATIONS)

    def case(name):
        checks.append(name)
        print('PASS', name, flush=True)

    try:
        with psycopg.connect(dsn, autocommit=True) as connection:
            version = connection.info.server_version
            assert 180000 <= version < 190000
            assert not connection.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s', (schema,)).fetchone(), 'fixture exists; refusing replacement'
            config = {'package':'refinement_shop','modules':['refinement_declarations'],'targets':[{'id':'local','kind':'postgresql','backendId':'weft-postgresql','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','binding':binding,'platform':[{'name':'postgresql','versions':[str(version)]}]}]}
            (root/'config.json').write_text(json.dumps(config,indent=2)+'\n')
            for suffix in ((),('--check',)):
                cli = subprocess.run([sys.executable,'-I','-B','-m','umf_access.build.catalog','catalog','--config',str(root/'config.json'),'--root',str(root),*suffix],capture_output=True,text=True,check=False)
                (root/('cli-check.log' if suffix else 'cli-generate.log')).write_text(cli.stdout+cli.stderr)
                assert cli.returncode == 0, cli.stdout+cli.stderr
            case('actual-public-cli-and-drift-check')
            sys.path.insert(0,str(root))
            from refinement_shop import queries
            from umf_access.targets import (
                PostgresConfiguration,
                PostgresTarget,
                binding_digest,
            )
            entries = tuple(v.entry for i in range(9) for v in getattr(queries,'_Q'+str(i)).variants)
            expected_nullable = {('col_0','col_1','col_2','col_3'): (False,False,False,False)}
            repeated_outputs = queries._Q0.variants[0].entry.artifact()['outputs']
            assert tuple(v['nullable'] for v in repeated_outputs) == expected_nullable[tuple(v['name'] for v in repeated_outputs)]
            mixed_outputs = queries._Q1.variants[0].entry.artifact()['outputs']
            assert tuple(v['nullable'] for v in mixed_outputs) == (True,False), mixed_outputs
            case('exact-required-optional-alias-output-carriers')
            connection.execute(f'CREATE SCHEMA {schema}')
            created = True
            try:
                connection.execute(f'CREATE TABLE {schema}.orders ("orderId" text PRIMARY KEY,amount numeric(40,20),revision bigint,memo text,"parentId" text,"peerId" text NOT NULL,"optionalPeerId" text)')
                with connection.cursor() as cursor:
                    cursor.executemany(f'INSERT INTO {schema}.orders VALUES (%s,%s,%s,%s,%s,%s,%s)', [('a',Decimal('1.25'),10,None,'b','c',None),('b',Decimal('2.50'),None,None,'c','d','a'),('c',Decimal('3.75'),30,None,'d','a',None),('d',Decimal('4.00'),40,None,None,'b','a'),('leaf',Decimal('5.00'),50,None,None,'c','b')])
                target = PostgresTarget(connection, PostgresConfiguration(schema,binding_digest(binding),(version,),timedelta(seconds=20)), entries)
                target.verify()
                case('original-native-admission')
                oracle = connection.execute(f'SELECT r."orderId",p."orderId",q."orderId",t."orderId" FROM {schema}.orders r INNER JOIN {schema}.orders p ON r."parentId"=p."orderId" INNER JOIN {schema}.orders q ON p."parentId"=q."orderId" INNER JOIN {schema}.orders t ON q."parentId"=t."orderId" ORDER BY r."orderId" COLLATE "C"').fetchall()
                assert oracle == [('a','b','c','d')], oracle
                assert queries.repeated(target) == oracle
                case('three-edge-distinct-row-self-join-native-oracle')
                assert queries.wrong_alias_projection(target) != oracle
                case('deliberate-wrong-alias-projection-detected')
                mixed_oracle = connection.execute(f'SELECT p."orderId",q."orderId" FROM {schema}.orders r LEFT JOIN {schema}.orders p ON r."parentId"=p."orderId" INNER JOIN {schema}.orders q ON r."peerId"=q."orderId" WHERE r."orderId"=%s',('leaf',)).fetchall()
                assert mixed_oracle == [(None,'c')], mixed_oracle
                assert queries.mixed(target) == mixed_oracle
                case('left-parent-missing-independent-inner-peer-present')
                assert queries.grouped(target) == [(30,Decimal('2.50'),1),(40,Decimal('3.75'),1),(None,Decimal('1.25'),1)]
                case('alias-group-sum-count-distinct-source-values')
                assert queries.aliased_root(target) == [('a',10),('b',None),('c',30),('d',40),('leaf',50)]
                case('aliased-root-original-field-validators')
                for index, expected in ((5,(False,False,False,True)),(6,(False,False,False,False)),(7,(False,False,True,False)),(8,(False,False,True,False))):
                    outputs = getattr(queries,'_Q'+str(index)).variants[0].entry.artifact()['outputs']
                    assert tuple(o['nullable'] for o in outputs)==expected,(index,outputs)
                case('exact-inner-ancestor-sibling-descendant-output-metadata')
                direct_oracle = connection.execute(f'SELECT r."orderId",p."orderId",q."orderId",p.revision FROM {schema}.orders r LEFT JOIN {schema}.orders p ON r."parentId"=p."orderId" INNER JOIN {schema}.orders q ON p."peerId"=q."orderId" ORDER BY r."orderId" COLLATE "C"').fetchall()
                assert direct_oracle == [('a','b','d',None),('b','c','a',30),('c','d','b',40)],direct_oracle
                assert queries.refine_direct(target)==direct_oracle
                case('optional-source-inner-filters-missing-parent-preserves-intrinsic-null')
                ancestor_oracle = connection.execute(f'SELECT r."orderId",p."orderId",q."orderId",t."orderId" FROM {schema}.orders r LEFT JOIN {schema}.orders p ON r."parentId"=p."orderId" LEFT JOIN {schema}.orders q ON p."parentId"=q."orderId" INNER JOIN {schema}.orders t ON q."peerId"=t."orderId" ORDER BY r."orderId" COLLATE "C"').fetchall()
                assert ancestor_oracle == [('a','b','c','a'),('b','c','d','b')],ancestor_oracle
                assert queries.refine_ancestors(target)==ancestor_oracle
                case('inner-refines-two-left-ancestors')
                sibling_oracle = connection.execute(f'SELECT r."orderId",p."orderId",s."orderId",q."orderId" FROM {schema}.orders r LEFT JOIN {schema}.orders p ON r."parentId"=p."orderId" LEFT JOIN {schema}.orders s ON r."optionalPeerId"=s."orderId" INNER JOIN {schema}.orders q ON p."peerId"=q."orderId" ORDER BY r."orderId" COLLATE "C"').fetchall()
                assert sibling_oracle == [('a','b',None,'d'),('b','c','a','a'),('c','d',None,'b')],sibling_oracle
                assert queries.refine_sibling(target)==sibling_oracle
                case('unrelated-left-sibling-remains-actually-nullable')
                descendant_oracle = connection.execute(f'SELECT r."orderId",p."orderId",s."orderId",q."orderId" FROM {schema}.orders r LEFT JOIN {schema}.orders p ON r."parentId"=p."orderId" LEFT JOIN {schema}.orders s ON p."parentId"=s."orderId" INNER JOIN {schema}.orders q ON p."peerId"=q."orderId" ORDER BY r."orderId" COLLATE "C"').fetchall()
                assert descendant_oracle == [('a','b','c','d'),('b','c','d','a'),('c','d',None,'b')],descendant_oracle
                assert queries.refine_descendant(target)==descendant_oracle
                case('left-descendant-outside-inner-ancestor-path-remains-nullable')
                import weft
                from umf_access.reviewed import ReadBuildError, ReviewedSQL
                wrong_binding = json.loads(json.dumps(binding))
                wrong_binding['relationships'][0]['pairs'] = [['peerId','orderId']]
                original = queries._Q0.variants[0].entry
                try:
                    ReviewedSQL(original.artifact()['sourceSql'],original.parameters,original.result).build(weft,target='postgresql18',binding=wrong_binding)
                except ReadBuildError as error:
                    prefix = 'Weft refused reviewed read: '
                    assert str(error).startswith(prefix), str(error)
                    assert json.loads(str(error)[len(prefix):]) == [{'code':'WFT-RAW-READ','message':'join is not a declared to-one relationship'}], str(error)
                else:
                    raise AssertionError('changed original relationship binding was admitted')
                case('original-compiler-refuses-swapped-relationship-binding')
            finally:
                connection.execute(f'DROP SCHEMA {schema} CASCADE')
                cleaned = True
            assert not connection.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s',(schema,)).fetchone()
            case('native-fixture-cleanup')
            status = 'PASS'
    finally:
        end = snapshot()
        receipt = {'status':status if start==end and (not created or cleaned) else 'FAILED','checks':checks,'serverVersion':version,'temporal':'HELD','sourceStart':start,'sourceEnd':end,'sourceUnchanged':start==end,'fixtureCleanupComplete':not created or cleaned}
        (root/'refinement-result.json').write_text(json.dumps(receipt,indent=2)+'\n')
        if start != end:
            raise AssertionError('source changed during alias qualification')
        if created and not cleaned:
            raise AssertionError('native alias fixture cleanup incomplete')


if __name__ == '__main__':
    main()

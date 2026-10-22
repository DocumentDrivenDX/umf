"""Generated source relationships, bounded Keys, S8 lists and related target sets.

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

DECLARATIONS = '''from decimal import Decimal
from relationship_shop import Order, OrderKey, OrderOrderKeyKey
from umf_access.dsl import query, Param
@query
def forward_has(key: Param[OrderKey]):
    return Order.objects.filter(Order.c.parent.has(key)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def inverse_has(key: Param[OrderOrderKeyKey]):
    return Order.objects.filter(Order.c.parent.inverse().has(key)).select(Order.c.code).order_by(Order.c.code.asc()).limit(20).all()
@query
def forward_keys():
    return Order.objects.include_keys(Order.c.parent,limit=2).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def inverse_keys():
    return Order.objects.include_keys(Order.c.parent.inverse(),limit=2).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def strings(values: Param[list[str|None]]):
    return Order.objects.filter(Order.c.memo.is_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def strings_not(values: Param[list[str|None]]):
    return Order.objects.filter(Order.c.memo.not_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def integers(values: Param[list[int|None]]):
    return Order.objects.filter(Order.c.units.is_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def decimals(values: Param[list[Decimal|None]]):
    return Order.objects.filter(Order.c.amount.is_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def booleans(values: Param[list[bool|None]]):
    return Order.objects.filter(Order.c.active.is_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_null_required():
    return Order.objects.filter(Order.c.code.is_in([None,'B'])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_null_required_not():
    return Order.objects.filter(Order.c.code.not_in([None,'B'])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_null_nullable():
    return Order.objects.filter(Order.c.memo.is_in([None,'x'])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_null_nullable_not():
    return Order.objects.filter(Order.c.memo.not_in([None,'x'])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_empty():
    return Order.objects.filter(Order.c.memo.is_in([])|Order.c.code.is_in([])).select(Order.c.order_id).limit(20).all()
@query
def literal_empty_not():
    return Order.objects.filter(Order.c.memo.not_in([])&Order.c.code.not_in([])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def integral_decimal():
    return Order.objects.filter((Order.c.amount==Decimal('1'))|Order.c.amount.is_in([Decimal('1E+2')])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def direct():
    return Order.objects.related(Order.c.parent).order_by(Order.c.code.asc()).limit(20).all()
@query
def inverse():
    return Order.objects.filter(Order.c.code=='B').related(Order.c.parent.inverse()).order_by(Order.c.code.asc()).limit(20).all()
@query
def pages(after: Param[OrderKey|None]):
    return Order.objects.related(Order.c.parent).order_by(Order.c.code.asc()).page(size=2,after=after)
@query
def inverse_peer_keys():
    return Order.objects.include_keys(Order.c.peer.inverse(),limit=2).order_by(Order.c.order_id.asc()).limit(20).all()
'''


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    harness = Path(__file__).resolve()
    generator = harness.parents[3] / 'scripts/generate-access-relationship-fixture.ts'
    schema = 'sdk_relationship_fixture'
    dsn = os.environ['UMF_PG_TEST_DSN']
    site = Path(sysconfig.get_path('purelib')) / 'umf_access'
    excluded = {'queries.py', '_umf/catalog.json', '_umf/catalog-manifest.json', '_umf/privileges.json'}

    def snapshot():
        return {'harness': hashlib.sha256(harness.read_bytes()).hexdigest(),
                'generator': hashlib.sha256(generator.read_bytes()).hexdigest(),
                'stageOneRequest': hashlib.sha256((root/'stage-one-request.json').read_bytes()).hexdigest(),
                'stageOneFiles': {str(p.relative_to(root/'relationship_shop')): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'relationship_shop').rglob('*')) if p.is_file() and '__pycache__' not in p.parts and str(p.relative_to(root/'relationship_shop')) not in excluded},
                'installedRuntime': {str(p.relative_to(site)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(site.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}}

    start = snapshot()
    status, checks, version = 'FAILED', [], None
    created, cleaned = False, False
    request = json.loads((root/'stage-one-request.json').read_text())
    model = request['sources'][0]['text']
    binding = {'version': 'umf.raw-read-binding/0.1', 'schema': None, 'modelJson': model,
               'modelSha256': hashlib.sha256(model.encode()).hexdigest(),
                'tables': [{'logical':['commerce','Order'],'native':'orders','key':['code'],
                   'columns':[{'logical':n,'native':n,'carrier':c,'nullable':nullable} for n,c,nullable in [
                       ('orderId','string',False),('keyNum','integer',False),('keyAmount','decimal',False),('keyFlag','boolean',False),('code','string',False),('parentId','string',True),('peerId','string',False),('amount','decimal',True),('units','integer',True),('memo','string',True),('active','boolean',True)]]}],
               'relationships':[{'module':'commerce','id':name,'source':['commerce','Order'],'target':['commerce','Order'],'pairs':[[name+'Id','code']],'toOne':True} for name in ('parent','peer')]}
    (root/'relationship_declarations.py').write_text(DECLARATIONS)

    def case(name):
        checks.append(name)
        print('PASS', name, flush=True)

    try:
        with psycopg.connect(dsn, autocommit=True) as connection:
            version = connection.info.server_version
            assert 180000 <= version < 190000
            assert not connection.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s', (schema,)).fetchone(), 'fixture exists; refusing replacement'
            config = {'package':'relationship_shop','modules':['relationship_declarations'],'targets':[{'id':'local','kind':'postgresql','backendId':'weft-postgresql','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','binding':binding,'platform':[{'name':'postgresql','versions':[str(version)]}]}]}
            (root/'config.json').write_text(json.dumps(config,indent=2)+'\n')
            for suffix in ((),('--check',)):
                cli = subprocess.run([sys.executable,'-I','-B','-m','umf_access.build.catalog','catalog','--config',str(root/'config.json'),'--root',str(root),*suffix],capture_output=True,text=True,check=False)
                (root/('cli-check.log' if suffix else 'cli-generate.log')).write_text(cli.stdout+cli.stderr)
                assert cli.returncode == 0, cli.stdout+cli.stderr
            case('actual-public-cli-and-drift-check')
            sys.path.insert(0,str(root))
            from relationship_shop import queries
            from umf_access.targets import (
                PostgresConfiguration,
                PostgresTarget,
                binding_digest,
            )
            entries = tuple(v.entry for i in range(20) for v in getattr(queries,'_Q'+str(i)).variants)
            for entry in entries:
                artifact=entry.artifact()
                if 'relatedRequest' in artifact:
                    assert artifact['relatedRequest']['relationship']['module']=='commerce'
                    assert artifact['sourceSql']==artifact['relatedRequest']['target']['sql']
            case('original-packet-and-related-target-custody')
            connection.execute(f'CREATE SCHEMA {schema}')
            created = True
            try:
                connection.execute(f'CREATE TABLE {schema}.orders ("orderId" text NOT NULL,"keyNum" bigint NOT NULL,"keyAmount" numeric(18,4) NOT NULL,"keyFlag" boolean NOT NULL,code text NOT NULL UNIQUE,"parentId" text,"peerId" text NOT NULL,amount numeric(40,20),units bigint,memo text,active boolean,PRIMARY KEY("orderId","keyNum","keyAmount","keyFlag"))')
                rows=[
                    ('a',-2**63,Decimal('-99999999999999.9999'),False,'A','B','D',Decimal(1),-2**63,'x',True),
                    ('a2',2**63-1,Decimal('99999999999999.9999'),True,'A2','B','C',Decimal(100),2**63-1,'é%\\',False),
                    ('a3',0,Decimal(0),False,'A3','B','C',Decimal('1.50'),0,None,None),
                    ('b',1,Decimal('1.2500'),True,'B','C','D',Decimal('2.50'),1,'x',False),
                    ('c',2,Decimal(2),False,'C','D','A',None,None,'other',True),
                    ('d',3,Decimal(3),True,'D',None,'B',Decimal('4.00'),4,None,None),
                ]
                with connection.cursor() as cursor:
                    cursor.executemany(f'INSERT INTO {schema}.orders VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',rows)
                # Native FK admission is an actual prerequisite, never a host assertion.
                for relation in ('parent','peer'):
                    connection.execute(f'ALTER TABLE {schema}.orders ADD CONSTRAINT fk_{relation} FOREIGN KEY ("{relation}Id") REFERENCES {schema}.orders(code)')
                target=PostgresTarget(connection,PostgresConfiguration(schema,binding_digest(binding),(version,),timedelta(seconds=20)),entries)
                target.verify();case('native-columns-keys-and-real-foreign-keys-admitted')
                from relationship_shop import OrderKey, OrderOrderKeyKey
                assert queries.forward_has(target,key=OrderKey(code='B'))==[('a',),('a2',),('a3',)]
                exact=OrderOrderKeyKey(order_id='a',key_num=-2**63,key_amount=Decimal('-99999999999999.9999'),key_flag=False)
                assert queries.inverse_has(target,key=exact)==[('B',)]
                case('forward-alternate-key-and-inverse-original-composite-primary')
                forward=queries.forward_keys(target)
                assert [r.row.order_id for r in forward]==sorted(r[0] for r in rows)
                assert forward[0].keys.items==(OrderKey(code='B'),) and not forward[0].keys.truncated
                assert forward[-1].keys.items==() and not forward[-1].keys.truncated
                inverse=queries.inverse_keys(target)
                b=next(r for r in inverse if r.row.code=='B')
                assert b.keys.items==(exact,OrderOrderKeyKey(order_id='a2',key_num=2**63-1,key_amount=Decimal('99999999999999.9999'),key_flag=True))
                assert b.keys.truncated is True
                assert all(type(k) is OrderOrderKeyKey for r in inverse for k in r.keys.items)
                peer_rows=queries.inverse_peer_keys(target)
                peer_c=next(r for r in peer_rows if r.row.code=='C')
                assert [k.order_id for k in peer_c.keys.items]==['a2','a3'] and peer_c.keys.truncated is False
                peer_b=next(r for r in peer_rows if r.row.code=='B')
                assert [k.order_id for k in peer_b.keys.items]==['d']
                case('distinct-self-relationship-canonical-id-and-exact-bound-not-truncated')
                case('bounded-lookahead-exact-original-key-class-and-numeric-extrema')
                # An internally valid alternate Key descriptor cannot replace
                # the original owner-selected inverse Key in a real artifact.
                from dataclasses import replace

                from relationship_shop import Order
                from umf_access.related_keys import (
                    key_descriptor,
                    make_related_result_model,
                    transport_spec,
                )
                from umf_access.reviewed import ReadBuildError
                original=entries[3]
                spec=transport_spec(original.result)
                assert spec is not None
                field,key_class,decoder,row_class=spec
                assert key_class is OrderOrderKeyKey
                swapped=dict(decoder);swapped['key']=key_descriptor(OrderKey)
                wrong_model=make_related_result_model('WrongSelectedKey',row_class,OrderKey,field,swapped,Order)
                try:replace(original,result=wrong_model).artifact()
                except ReadBuildError:pass
                else:raise AssertionError('internally valid selected-Key output substitution admitted')
                case('actual-original-artifact-rejects-valid-wrong-key-descriptor-substitution')
                def expected(index,values,negated=False):
                    # Independent S8 oracle, explicitly includes empty-container law.
                    return [(r[0],) for r in sorted(rows) if (not values if negated else bool(values)) and (not values or r[index] is not None) and ((r[index] not in [v for v in values if v is not None]) if negated else r[index] in [v for v in values if v is not None])]
                for values in ([],[None],[None,'x'],['é%\\'],['absent',None]):
                    assert queries.strings(target,values=values)==expected(9,values)
                    # Empty NOT IN is TRUE, even for NULL lhs.
                    wanted=[(r[0],) for r in sorted(rows)] if not values else expected(9,values,True)
                    assert queries.strings_not(target,values=values)==wanted
                for fn,index,vectors in ((queries.integers,8,([], [None], [None,-2**63,2**63-1,2**80,-2**80])),(queries.decimals,7,([], [None], [None,Decimal(1),Decimal('1E+2'),Decimal('1.50000000000000000000')])),(queries.booleans,10,([], [None], [None,True], [False]))):
                    for values in vectors:assert fn(target,values=values)==expected(index,values)
                case('all-four-list-carriers-empty-null-unmatched-null-exact-large-numeric')
                assert queries.literal_null_required(target)==[('b',)]
                assert queries.literal_null_required_not(target)==[(r[0],) for r in sorted(rows) if r[4]!='B']
                assert queries.literal_null_nullable(target)==[('a',),('b',)]
                assert queries.literal_null_nullable_not(target)==[('a2',),('c',)]
                assert queries.literal_empty(target)==[]
                assert queries.literal_empty_not(target)==[(r[0],) for r in sorted(rows)]
                assert queries.integral_decimal(target)==[('a',),('a2',)]
                case('literal-S8-null-members-both-nullabilities-IN-NOT-IN-empty-and-decimal-family')
                oracle=connection.execute(f'SELECT t.code FROM {schema}.orders t WHERE EXISTS(SELECT 1 FROM {schema}.orders s WHERE s."parentId"=t.code) ORDER BY t.code COLLATE "C"').fetchall()
                assert oracle==[('B',),('C',),('D',)]
                assert [(r.code,) for r in queries.direct(target)]==oracle
                assert [r.code for r in queries.inverse(target)]==['A','A2','A3']
                case('original-source-and-target-wildcard-related-EXISTS-independent-native-oracle')
                first=queries.pages(target,after=None)
                assert [r.code for r in first.items]==['B','C'] and first.next_after is not None
                assert type(first.next_after.key) is OrderKey
                second=queries.pages(target,after=first.next_after)
                assert [r.code for r in second.items]==['D'] and second.next_after is None
                assert [r.code for r in queries.pages_stream(target,after=None,max_rows=10,page_size=1)]==['B','C','D']
                case('related-keyset-and-stream-selected-code-key-distinct-from-original-inverse-key')
                connection.execute(f'ALTER TABLE {schema}.orders DROP CONSTRAINT fk_parent')
                from umf_access.pages import ReadObligationUnmet
                try:queries.forward_has(target,key=OrderKey(code='B'))
                except ReadObligationUnmet:pass
                else:raise AssertionError('missing real FK was admitted')
                connection.execute(f'ALTER TABLE {schema}.orders ADD CONSTRAINT fk_parent FOREIGN KEY ("parentId") REFERENCES {schema}.orders(code)')
                assert queries.forward_has(target,key=OrderKey(code='B'))==[('a',),('a2',),('a3',)]
                case('missing-native-FK-original-refusal-and-restored-recovery')
            finally:
                connection.execute(f'DROP SCHEMA {schema} CASCADE')
                cleaned = True
            assert not connection.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s',(schema,)).fetchone()
            case('native-fixture-cleanup')
            status = 'PASS'
    finally:
        end = snapshot()
        receipt = {'status':status if start==end and (not created or cleaned) else 'FAILED','checks':checks,'serverVersion':version,'temporal':'HELD','sourceStart':start,'sourceEnd':end,'sourceUnchanged':start==end,'fixtureCleanupComplete':not created or cleaned}
        (root/'relationship-result.json').write_text(json.dumps(receipt,indent=2)+'\n')
        if start != end:
            raise AssertionError('source changed during related qualification')
        if created and not cleaned:
            raise AssertionError('native related fixture cleanup incomplete')


if __name__ == '__main__':
    main()

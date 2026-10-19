# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual generated CLI/catalog/native aggregate campaign; requires an explicit PG18 DSN.

The caller owns the database process. This script creates and removes only its
fixed dedicated fixture schema; temporal qualification remains held.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import subprocess
import sys
import sysconfig
from datetime import timedelta
from decimal import ROUND_HALF_EVEN, Decimal, localcontext
from inspect import cleandoc
from pathlib import Path

import psycopg


def main() -> None:
 root = Path(sys.argv[1]).resolve()
 harness_path=Path(__file__).resolve()
 version=None
 schema = 'sdk_r6_aggregate_fixture'
 dsn = os.environ['UMF_PG_TEST_DSN']
 request = json.loads((root / 'stage-one-request.json').read_text())
 model = request['sources'][0]['text']
 binding = {'version':'umf.raw-read-binding/0.1','schema':None,'modelJson':model,
  'modelSha256':hashlib.sha256(model.encode()).hexdigest(), 'tables':[
  {'logical':['commerce','Order'],'native':'orders','key':['orderId'],'columns':[
  {'logical':name,'native':name,'carrier':carrier,'nullable':nullable}
  for name,carrier,nullable in [('orderId','string',False),('amount','decimal',True),('revision','integer',True),('memo','string',True)]]}], 'relationships':[]}
 declarations = '''from aggregate_shop import Order
 from decimal import Decimal
 from umf_access.dsl import Param,query,sum_,avg_,min_,max_,count,count_distinct
 @query
 def totals(group: Param[str]):
  return Order.objects.filter(Order.c.memo == group).select(sum_(Order.c.revision),sum_(Order.c.amount),avg_(Order.c.amount,scale=0),avg_(Order.c.amount,scale=1),avg_(Order.c.amount,scale=1000),count(),count_distinct(Order.c.amount),count_distinct(Order.c.memo)).all()
 @query
 def extrema(group: Param[str]):
  return Order.objects.filter(Order.c.memo == group).select(min_(Order.c.amount),max_(Order.c.amount)).all()
 @query
 def buckets():
  return Order.objects.filter(Order.c.memo == 'buckets').group_by(Order.c.revision.bucket_width(3)).select(Order.c.revision.bucket_width(3),sum_(Order.c.revision),count()).order_by(sum_(Order.c.revision).asc()).limit(20).all()
 @query
 def decimal_buckets():
  return Order.objects.filter(Order.c.memo == 'decimal-buckets').group_by(Order.c.amount.bucket_width(Decimal('0.25'))).select(Order.c.amount.bucket_width(Decimal('0.25')),sum_(Order.c.amount),count()).order_by(sum_(Order.c.amount).asc()).limit(20).all()
 @query
 def decimal_integer_width():
  return Order.objects.filter(Order.c.memo == 'decimal-buckets').group_by(Order.c.amount.bucket_width(1)).select(Order.c.amount.bucket_width(1),sum_(Order.c.amount),count()).order_by(sum_(Order.c.amount).asc()).limit(20).all()
 @query
 def integer_decimal_width():
  return Order.objects.filter(Order.c.memo == 'buckets').group_by(Order.c.revision.bucket_width(Decimal('2.5'))).select(Order.c.revision.bucket_width(Decimal('2.5')),sum_(Order.c.revision),count()).order_by(sum_(Order.c.revision).asc()).limit(20).all()
 @query
 def grouped_count():
  return Order.objects.filter(Order.c.memo == 'buckets').group_by(Order.c.revision.bucket_width(3)).limit(20).count()
 @query
 def integral_decimal_width():
  return Order.objects.filter(Order.c.memo == 'buckets').select(Order.c.revision.bucket_width(Decimal('3')),Order.c.revision.bucket_width(Decimal('1E+1'))).order_by(Order.c.order_id.asc()).limit(20).all()
 @query
 def count_having(group: Param[str]):
  return Order.objects.filter(Order.c.memo == group).select(count()).having(count()>0).all()
 @query
 def combined_having(group: Param[str]):
  return Order.objects.filter(Order.c.memo == group).select(count(),sum_(Order.c.revision)).having((count()>0) & (sum_(Order.c.revision)>0)).all()
 @query
 def global_counts():
  return Order.objects.select(count(),count_distinct(Order.c.memo),count_distinct(Order.c.amount),count_distinct(Order.c.revision)).all()
 @query
 def having_positive():
  return Order.objects.filter(Order.c.memo == 'buckets').group_by(Order.c.revision.bucket_width(3)).having(sum_(Order.c.revision)>0).select(Order.c.revision.bucket_width(3),sum_(Order.c.revision)).order_by(sum_(Order.c.revision).desc()).limit(20).all()
 '''
 declarations=cleandoc(declarations)+'\n'
 (root/'declarations.py').write_text(declarations)
 checks=[]
 schema_created=False
 schema_cleaned=False
 status='FAILED'
 generator=Path(__file__).resolve().parents[3]/'scripts/generate-access-aggregate-fixture.ts'
 def source_snapshot():
  site=Path(sysconfig.get_path('purelib'))/'umf_access'
  return {'harness':hashlib.sha256(harness_path.read_bytes()).hexdigest(),
  'generator':hashlib.sha256(generator.read_bytes()).hexdigest(),
  'stageOneRequest':hashlib.sha256((root/'stage-one-request.json').read_bytes()).hexdigest(),
  'stageOneFiles':{str(p.relative_to(root/'aggregate_shop')):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'aggregate_shop').rglob('*')) if p.is_file() and '__pycache__' not in p.parts and str(p.relative_to(root/'aggregate_shop')) not in ('queries.py','_umf/catalog.json','_umf/catalog-manifest.json','_umf/privileges.json')},
  'installedRuntime':{str(p.relative_to(site)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(site.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}}
 source_start=source_snapshot()
 def receipt():
  end=source_snapshot()
  (root/'aggregate-result.json').write_text(json.dumps({'status':status if source_start==end else 'FAILED','checks':checks,'serverVersion':version,'temporal':'HELD','sourceStart':source_start,'sourceEnd':end,'sourceUnchanged':source_start==end,'fixtureCleanupComplete':not schema_created or schema_cleaned},indent=2)+'\n')
  if source_start != end:
   raise AssertionError('source changed during aggregate qualification')

 def cli(*args):
  completed=subprocess.run([sys.executable,'-I','-B','-m','umf_access.build.catalog','catalog','--config',str(root/'config.json'),'--root',str(root),*args],capture_output=True,text=True,check=False)
  (root/('cli-check.log' if args else 'cli-generate.log')).write_text(completed.stdout+completed.stderr)
  assert completed.returncode==0,completed.stdout+completed.stderr

 def case(name):
  checks.append(name)
  print('PASS',name,flush=True)

 try:
  with psycopg.connect(dsn,autocommit=True) as admin:
   version=admin.info.server_version
   assert 180000 <= version < 190000
   assert not admin.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s',(schema,)).fetchone(), 'fixture schema already exists; refusing to replace it'
   config={'package':'aggregate_shop','modules':['declarations'],'targets':[{'id':'local','kind':'postgresql','backendId':'weft-postgresql','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','binding':binding,'platform':[{'name':'postgresql','versions':[str(version)]}]}]}
   (root/'config.json').write_text(json.dumps(config,indent=2)+'\n')
   cli();cli('--check');case('actual-generated-public-cli-and-drift-check')
   for label, body in (
    ('ungrouped-raw-projection', 'return Order.objects.group_by(Order.c.revision.bucket_width(3)).select(Order.c.revision,sum_(Order.c.revision)).limit(20).all()'),
    ('ungrouped-raw-having', 'return Order.objects.group_by(Order.c.revision.bucket_width(3)).having(Order.c.revision>0).select(Order.c.revision.bucket_width(3),sum_(Order.c.revision)).limit(20).all()'),
   ):
    before={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'aggregate_shop').rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    (root/'bad_declarations.py').write_text('from aggregate_shop import Order\nfrom umf_access.dsl import query,sum_\n@query\ndef rejected():\n '+body+'\n')
    (root/'bad-config.json').write_text(json.dumps({**config,'modules':['bad_declarations']}))
    refused=subprocess.run([sys.executable,'-I','-B','-m','umf_access.build.catalog','catalog','--config',str(root/'bad-config.json'),'--root',str(root)],capture_output=True,text=True,check=False)
    (root/(label+'.log')).write_text(refused.stdout+refused.stderr)
    assert refused.returncode == 1 and refused.stdout == '',refused.stdout+refused.stderr
    envelope=json.loads(refused.stderr)
    assert set(envelope)=={'status','reason'} and envelope['status']=='refused',envelope
    prefix='Weft refused reviewed read: '
    assert envelope['reason'].startswith(prefix),envelope
    diagnostic=json.loads(envelope['reason'][len(prefix):])
    expected_message='ungrouped projected column' if label=='ungrouped-raw-projection' else 'ungrouped HAVING column'
    assert diagnostic==[{'code':'WFT-RAW-READ','message':expected_message}],diagnostic
    after={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'aggregate_shop').rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    assert before==after,'refused compiler attempt modified owned generated tree'
    case('actual-compiler-refuses-'+label)
   sys.path.insert(0,str(root))
   from aggregate_shop import queries
   from umf_access.targets import (
    AsyncPostgresTarget,
    PostgresConfiguration,
    PostgresTarget,
    binding_digest,
   )
   configuration=PostgresConfiguration(schema,binding_digest(binding),(version,),timedelta(seconds=20))
   entries=tuple(variant.entry for i in range(12) for variant in getattr(queries,'_Q'+str(i)).variants)
   admin.execute(f'CREATE SCHEMA {schema}')
   schema_created=True
   try:
    admin.execute(f'CREATE TABLE {schema}.orders ("orderId" text PRIMARY KEY, amount numeric(40,20), revision bigint, memo text)')
    cases={'positive-even':['2.5'],'positive-odd':['3.5'],'negative-even':['-2.5'],'negative-odd':['-3.5'], 'near-above':['2.50000000000000000001'],'near-below':['2.49999999999999999999'],'negative-near-above':['-2.50000000000000000001'],'negative-near-below':['-2.49999999999999999999'], 'scale-one-even':['1.25'],'scale-one-odd':['1.35'],'negative-scale-one-even':['-1.25'],'negative-scale-one-odd':['-1.35'],'third':['1','0','0'],'all-null':[None,None], 'overflow':['1','1']}
    data=[]
    for name,values in cases.items():
     for i,value in enumerate(values):data.append((f'{name}-{i}',None if value is None else Decimal(value),2**63-1 if name=='overflow' else None if name=='all-null' else 0,name))
    for i,value in enumerate((-7,-6,-1,0,1,2,3,6,None)):data.append((f'bucket-{i}',Decimal(0),value,'buckets'))
    for i,value in enumerate(('-0.51','-0.50','-0.01','0','0.01','0.25','0.50',None)):
     data.append((f'decimal-bucket-{i}',None if value is None else Decimal(value),0,'decimal-buckets'))
    for i,memo in enumerate(('é','e\u0301',None)):
     data.append((f'unicode-{i}',None,None,memo))
    with admin.cursor() as cursor:cursor.executemany(f'INSERT INTO {schema}.orders VALUES (%s,%s,%s,%s)',data)
    target=PostgresTarget(admin,configuration,entries)
    target.verify();case('original-compiler-catalog-and-native-admission')
    def expected_average(values,scale):
     nonnull=[Decimal(v) for v in values if v is not None]
     if not nonnull:return None
     with localcontext() as ctx:
      ctx.prec=1250
      return (sum(nonnull)/len(nonnull)).quantize(Decimal(1).scaleb(-scale),rounding=ROUND_HALF_EVEN)
    for name,values in {**cases,'empty':[]}.items():
     result=queries.totals(target,group=name)
     assert len(result)==1,(name,result)
     row=result[0];nonnull=[Decimal(v) for v in values if v is not None]
     expected=(2*(2**63-1) if name=='overflow' else 0 if values and name!='all-null' else None,sum(nonnull) if nonnull else None,expected_average(values,0),expected_average(values,1),expected_average(values,1000),len(values),len(set(nonnull)),1 if values else 0)
     assert row==expected,(name,row,expected)
     assert row[0] is None or type(row[0]) is int
     for index,scale in ((2,0),(3,1),(4,1000)):
      assert row[index] is None or row[index].as_tuple().exponent == -scale,(name,index,row[index].as_tuple())
     assert type(row[-1]) is int and type(row[-2]) is int
     extrema=queries.extrema(target,group=name)
     assert extrema==[(min(nonnull) if nonnull else None,max(nonnull) if nonnull else None)],(name,extrema)
     case('native-'+name+'-exact-sum-avg-scales-0-1-1000-extrema-count')
    buckets=queries.buckets(target)
    assert buckets==[(-9,-7,1),(-6,-6,1),(-3,-1,1),(0,3,3),(3,3,1),(6,6,1),(None,None,1)],buckets
    assert all(v is None or type(v) is int for row in buckets for v in row)
    case('native-negative-floor-null-buckets-and-aggregate-order')
    positive=queries.having_positive(target)
    assert positive==[(6,6),(0,3),(3,3)],positive
    case('native-bucket-having-and-descending-aggregate-order')
    decimal_rows=queries.decimal_buckets(target)
    decimal_expected=[(Decimal('-0.75'),Decimal('-0.51'),1),(Decimal('-0.50'),Decimal('-0.50'),1),(Decimal('-0.25'),Decimal('-0.01'),1),(Decimal(0),Decimal('0.01'),2),(Decimal('0.25'),Decimal('0.25'),1),(Decimal('0.50'),Decimal('0.50'),1),(None,None,1)]
    assert decimal_rows==decimal_expected,decimal_rows
    assert all(key is None or type(key) is Decimal for key,_,_ in decimal_rows)
    assert queries.decimal_integer_width(target)==[(Decimal(-1),Decimal('-1.02'),3),(Decimal(0),Decimal('0.76'),4),(None,None,1)]
    assert queries.integer_decimal_width(target)==[(Decimal('-7.5'),-13,2),(Decimal('-2.5'),-1,1),(Decimal(0),3,3),(Decimal('2.5'),3,1),(Decimal(5),6,1),(None,None,1)]
    case('native-all-three-decimal-bucket-carrier-profiles-and-negative-floor')
    assert queries.grouped_count(target)==[(-9,1),(-6,1),(-3,1),(0,3),(3,1),(6,1),(None,1)]
    case('native-generated-bucket-group-count-metadata')
    expected_counts=(len(data),len({r[3] for r in data if r[3] is not None}),len({r[1] for r in data if r[1] is not None}),len({r[2] for r in data if r[2] is not None}))
    assert queries.global_counts(target)==[expected_counts]
    assert len({data[-3][3],data[-2][3]})==2
    case('native-distinct-null-elision-and-binary-unicode-identity')
    integral=queries.integral_decimal_width(target)
    expected_integral=[(Decimal(a),Decimal(b)) if a is not None else (None,None) for a,b in ((-9,-10),(-6,-10),(-3,-10),(0,0),(0,0),(0,0),(3,0),(6,0),(None,None))]
    assert integral==expected_integral,integral
    assert all(value is None or type(value) is Decimal for row in integral for value in row)
    assert queries.count_having(target,group='overflow')==[(2,)]
    assert queries.count_having(target,group='empty')==[]
    assert queries.combined_having(target,group='overflow')==[(2,2**64-2)]
    assert queries.combined_having(target,group='empty')==[]
    case('native-integral-exponent-decimal-width-and-zero-key-count-having')
    async def async_overflow():
     async with await psycopg.AsyncConnection.connect(dsn,autocommit=True) as conn:
      target=AsyncPostgresTarget(conn,configuration,entries)
      await target.verify()
      row=(await queries.totals(target,group='overflow'))[0]
      assert row[0]==2**64-2 and type(row[0]) is int
    asyncio.run(async_overflow());case('native-async-integer-sum-over-int64')
   finally:
    admin.execute(f'DROP SCHEMA {schema} CASCADE')
    assert not admin.execute('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=%s',(schema,)).fetchone()
    schema_cleaned=True
    case('fixture-schema-cleanup')
  assert source_snapshot()==source_start,'source changed during aggregate qualification'
  status='PASS'
 finally:
  receipt()


main()

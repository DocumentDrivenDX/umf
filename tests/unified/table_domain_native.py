# SPDX-License-Identifier: MIT OR Apache-2.0
"""Small PostgreSQL oracle for the synthetic legal domain-authoring fixture."""
from __future__ import annotations

import argparse
import json
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from umf_access.lifecycle import apply_table_migration
from umf_codegen import compile_table_deployment, compile_table_migration

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--source',type=Path,default=Path('/private/tmp/umf-legal-domain-native-source.json'))
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
source=json.loads(args.source.read_text())
prefix='domain_'+uuid4().hex[:12]
configuration={'module':'legal_lifecycle','schema':prefix,'ownerRole':prefix+'_owner',
    'personRole':prefix+'_person','batchRole':prefix+'_batch','groupRoles':{'billing_admin':prefix+'_billing'}}
deployed=compile_table_deployment(json.dumps(source,separators=(',',':')),configuration=configuration)
assert deployed['status']=='compiled',deployed
initial=compile_table_migration(migration_id='domain-001',predecessor=None,previous_bundle=None,next_bundle=deployed['bundle'])
assert initial['status']=='compiled',initial
plan=initial['plan'];owner=configuration['ownerRole'];person=configuration['personRole'];batch=configuration['batchRole'];billing=configuration['groupRoles']['billing_admin']
checks=[]
def check(name,condition):
    assert condition,(name,condition)
    checks.append(name)

with psycopg.connect(args.dsn,autocommit=True) as connection:
    server=connection.execute('SELECT pg_catalog.version()').fetchone()[0]
    created=[];schema_created=False
    try:
        for role in (owner,person,batch,billing):
            connection.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created.append(role)
        connection.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(configuration['schema']),sql.Identifier(owner)));schema_created=True
        with connection.transaction():
            connection.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            connection.execute('SET LOCAL search_path=pg_catalog')
            applied=apply_table_migration(connection,plan,approved_digest=plan['digest'],expected_head=None,person_roles=())
        check('synthetic-domain-deployment-installed',applied['generation']==1)
        schema=configuration['schema']
        check('escaped-table-comment-round-trips',connection.execute('SELECT pg_catalog.obj_description(%s::regclass)',(schema+'.matters',)).fetchone()[0]==source['modules'][0]['elements'][next(i for i,e in enumerate(source['modules'][0]['elements']) if e['id']=='matters')]['description'])
        comment_rows=connection.execute('SELECT pg_catalog.col_description(%s::regclass,a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=%s::regclass AND a.attname IN (%s,%s) ORDER BY a.attname',(schema+'.matters',schema+'.matters','review_state','risk_score')).fetchall()
        comments=[row[0] for row in comment_rows]
        check('escaped-and-domain-column-comments-round-trip',comments==[
            'Review state: "draft"\\approved\nretained exactly.',
            'Optional risk score in [0, 100); NULL means not assessed.'])
        check('nullable-domain-fields-allow-null',connection.execute(sql.SQL('SELECT review_state IS NULL AND risk_score IS NULL FROM {} WHERE matter_id=1').format(sql.Identifier(schema,'matters')).as_string(connection)).fetchone()==(True,))
        relation=sql.Identifier(schema,'matters')
        insert=sql.SQL('INSERT INTO {} (matter_id,client_id,matter_number,matter_title,practice_area,open_date,close_date,jurisdiction,court,review_state,risk_score) VALUES (%s,1,%s,%s,%s,%s,NULL,%s,%s,%s,%s)').format(relation)
        base=('D-','Synthetic insert','testing','2026-01-01','test','test')
        connection.execute(insert,(9,'D-9',*base[1:],'ready',Decimal('99.99')))
        check('enum-and-range-valid-native-values-accepted',connection.execute(sql.SQL('SELECT review_state,risk_score FROM {} WHERE matter_id=9').format(relation)).fetchone()==('ready',Decimal('99.99')))
        for matter_id,state,risk in ((10,'unknown',None),(11,None,Decimal('-0.01')),(12,None,Decimal('100.00'))):
            try:connection.execute(insert,(matter_id,f'D-{matter_id}',*base[1:],state,risk))
            except psycopg.errors.CheckViolation:check(f'native-domain-rejects-{matter_id}',True)
            else:raise AssertionError(f'PostgreSQL accepted invalid domain row {matter_id}')
    finally:
        if schema_created:connection.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(configuration['schema'])))
        for role in reversed(created):connection.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps({'server':server,'checks':checks},indent=2)+'\n')
print(json.dumps({'checks':checks},separators=(',',':')))

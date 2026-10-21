# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native PostgreSQL oracle for the exact legal owner-plus-via authoring case."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from umf_codegen import compile_table_deployment

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',default='dbname=postgres')
parser.add_argument('--fixture',type=Path,default=Path('fixtures/table-lifecycle/legal/owner-via.json'))
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
document=json.loads(args.fixture.read_text())
prefix='ov_'+uuid4().hex[:10]+'_'
alice,bob,neither=prefix+'alice',prefix+'bob',prefix+'none'
cfg={'module':'legal_lifecycle','schema':prefix+'schema','ownerRole':prefix+'owner',
     'personRole':prefix+'person','batchRole':prefix+'batch','groupRoles':{'billing_admin':prefix+'billing'}}
roles=[cfg['ownerRole'],cfg['personRole'],cfg['batchRole'],cfg['groupRoles']['billing_admin'],alice,bob,neither]
result=compile_table_deployment(json.dumps(document,separators=(',',':')),configuration=cfg)
assert result['status']=='compiled',result
bundle=result['bundle']
checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)

with psycopg.connect(args.dsn,autocommit=True) as admin:
    created=[];schema_created=False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)));created.append(role)
        for person in (alice,bob,neither):
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE,SET FALSE').format(sql.Identifier(cfg['personRole']),sql.Identifier(person)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(cfg['schema']),sql.Identifier(cfg['ownerRole'])));schema_created=True
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(cfg['ownerRole'])))
            admin.execute('SET LOCAL search_path=pg_catalog')
            for step in bundle['steps']:
                admin.execute(step['sql'])
        # Fabricated host-owned rows: Alice owns matter 1; Alice is assigned to
        # matter 2, which Bob owns. Charlie has no owner or membership match.
        admin.execute(sql.SQL("INSERT INTO {} (client_id,client_name) VALUES (1,'Synthetic client')").format(sql.Identifier(cfg['schema'],'clients')))
        admin.execute(sql.SQL("INSERT INTO {} (timekeeper_id,timekeeper_name,timekeeper_level,billing_rate) VALUES (1,'Synthetic','associate',125.00),(2,'Synthetic','partner',250.00)").format(sql.Identifier(cfg['schema'],'timekeepers')))
        matters=sql.Identifier(cfg['schema'],'matters');teams=sql.Identifier(cfg['schema'],'matter_teams')
        admin.execute(sql.SQL("INSERT INTO {} (matter_id,client_id,matter_number,matter_title,practice_area,open_date,close_date,jurisdiction,court,authorization_principal) VALUES (1,1,'DEMO-1','Synthetic one','demo','2026-01-01',NULL,'synthetic','demo',{}),(2,1,'DEMO-2','Synthetic two','demo','2026-01-01',NULL,'synthetic','demo',{})").format(matters,sql.Literal(alice),sql.Literal(bob)))
        admin.execute(sql.SQL('INSERT INTO {} (matter_team_id,matter_id,timekeeper_id,database_role) VALUES (2,2,2,{})').format(teams,sql.Literal(alice)))
        def visible(role,statement):
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(role)))
                return admin.execute(statement).fetchall()
        check('owner-only-row-visible',visible(alice,sql.SQL('SELECT matter_id FROM {} WHERE matter_id=1').format(matters))==[(1,)])
        check('via-only-row-visible',visible(alice,sql.SQL('SELECT matter_id FROM {} WHERE matter_id=2').format(matters))==[(2,)])
        check('neither-owner-nor-via-denied',visible(neither,sql.SQL('SELECT matter_id FROM {} ORDER BY matter_id').format(matters))==[])
        check('force-row-level-security',admin.execute('SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid=%s::regclass',(cfg['schema']+'.matters',)).fetchone()==(True,))
        try:visible(alice,sql.SQL('UPDATE {} SET matter_id=99 WHERE matter_id=2 RETURNING matter_id').format(matters))
        except psycopg.errors.InsufficientPrivilege:check('old-row-visible-new-row-with-check-denies',True)
        else:raise AssertionError('owner-plus-via WITH CHECK accepted an unassigned new row')
        # Host authorization changes are observed on the next statement.
        admin.execute(sql.SQL('UPDATE {} SET database_role={} WHERE matter_id=2').format(teams,sql.Literal(bob)))
        check('membership-reassignment-revokes-alice',visible(alice,sql.SQL('SELECT matter_id FROM {} WHERE matter_id=2').format(matters))==[])
        check('membership-reassignment-grants-bob',visible(bob,sql.SQL('SELECT matter_id FROM {} WHERE matter_id=2').format(matters))==[(2,)])
        admin.execute(sql.SQL('UPDATE {} SET database_role={} WHERE matter_id=2').format(teams,sql.Literal(alice)))
        check('membership-reassignment-restores-alice',visible(alice,sql.SQL('SELECT matter_id FROM {} WHERE matter_id=2').format(matters))==[(2,)])
        for role,statement in [(alice,sql.SQL("INSERT INTO {} (matter_team_id,matter_id,timekeeper_id,database_role) VALUES (9,1,1,'forged')").format(teams)),(cfg['batchRole'],sql.SQL("INSERT INTO {} (matter_team_id,matter_id,timekeeper_id,database_role) VALUES (10,1,1,'forged')").format(teams))]:
            try:visible(role,statement)
            except psycopg.errors.InsufficientPrivilege:check('roster-write-denied-'+role.split('_')[-1],True)
            else:raise AssertionError('person or batch roster write was admitted')
    finally:
        admin.execute('RESET ROLE')
        if schema_created:admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cfg['schema'])))
        for role in reversed(created):admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))

args.report.write_text(json.dumps({'serverMajor':18,'scope':'fabricated owner-plus-via legal fixture; no managed/private-consumer or release claim','bundleDigest':bundle['bundleDigest'],'assertions':checks,'count':len(checks)},indent=2)+'\n')
print(json.dumps({'passed':len(checks),'report':str(args.report)}))

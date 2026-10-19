# SPDX-License-Identifier: MIT OR Apache-2.0
"""Execute independently authored deployment fixture on isolated PostgreSQL18.

This is a compiler conformance probe, not a production bundle/migration executor.
Only synthetic schema/role names emitted by the fixture are accepted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from decimal import Decimal
from pathlib import Path

import psycopg
from psycopg import sql

parser = argparse.ArgumentParser()
parser.add_argument('--dsn', required=True)
parser.add_argument('--bundle', required=True, type=Path)
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()
bundle = json.loads(args.bundle.read_text())
configuration = bundle['configuration']
schema, owner, person, batch = [configuration[k] for k in ('schema','ownerRole','personRole','batchRole')]
group = configuration['groupRoles']['readers']
assert all(re.fullmatch(r'p2_[a-f0-9]{12}_(schema|owner|person|batch|readers)', n) for n in (schema,owner,person,batch,group))
alice, bob = owner+'_alice', owner+'_bob'
outsider = owner+'_outsider'
roles = [owner,person,batch,group,alice,bob,outsider]
observations = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    observations.append(name)

with psycopg.connect(args.dsn, autocommit=True) as admin:
    check('native-major-18', admin.info.server_version // 10000 == 18)
    created = []
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE').format(sql.Identifier(role)))
            created.append(role)
        for role in (alice,bob):
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE, SET FALSE').format(sql.Identifier(person),sql.Identifier(role)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(schema),sql.Identifier(owner)))
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            admin.execute('SET LOCAL search_path=pg_catalog')
            for step in bundle['steps']:
                admin.execute(step['sql'])
        tables = admin.execute('SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname=%s AND c.relkind=\'r\' ORDER BY c.relname',(schema,)).fetchall()
        check('both-tables-owned-and-forced-rls', tables == [('notes',True,True,owner),('parents',True,True,owner)])
        check('eight-command-policies-per-table',admin.execute('SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname=%s',(schema,)).fetchone()[0] == 16)
        for table in ('parents','notes'):
            relation=sql.Identifier(schema,table)
            for identity in (alice,bob):
                with admin.transaction():
                    admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(identity)))
                    statement=sql.SQL('INSERT INTO {} (id,owner) VALUES (%s,%s)') if table=='parents' else sql.SQL('INSERT INTO {} (id,owner,parent_id) VALUES (%s,%s,%s)')
                    values=(identity,identity) if table=='parents' else (identity,identity,identity)
                    admin.execute(statement.format(relation),values)
                    rows=admin.execute(sql.SQL('SELECT id FROM {}').format(relation)).fetchall()
                    check(table+'-person-sees-only-own-'+identity,rows == [(identity,)])
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(batch)))
                check(table+'-batch-has-independent-select',len(admin.execute(sql.SQL('SELECT id FROM {}').format(relation)).fetchall()) == 2)
            for identity in (batch,outsider):
                denied=False
                try:
                    with admin.transaction():
                        admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(identity)))
                        admin.execute(sql.SQL('INSERT INTO {} (id,owner) VALUES (%s,%s)').format(relation),('forbidden',identity))
                except psycopg.errors.InsufficientPrivilege:
                    denied=True
                check(table+'-no-implicit-outsider-or-batch-write-'+identity,denied)
        for label,query,values,expected in [
            ('new-owner-check','UPDATE {} SET owner=%s WHERE id=%s',(bob,alice),psycopg.errors.InsufficientPrivilege),
            ('immutable-key-grant','UPDATE {} SET id=%s WHERE id=%s',('moved',alice),psycopg.errors.InsufficientPrivilege),
            ('parent-visibility-check','UPDATE {} SET parent_id=%s WHERE id=%s',(bob,alice),psycopg.errors.InsufficientPrivilege),
            ('invisible-parent-refused-before-effect','UPDATE {} SET parent_id=%s WHERE id=%s',('absent',alice),psycopg.errors.InsufficientPrivilege),
            ('native-check-constraint','UPDATE {} SET amount=%s WHERE id=%s',(Decimal('-1.00'),alice),psycopg.errors.CheckViolation),
        ]:
            denied=False
            try:
                with admin.transaction():
                    admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(alice)))
                    admin.execute(sql.SQL(query).format(sql.Identifier(schema,'notes')),values)
            except expected:
                denied=True
            check(label,denied)
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(alice)))
            values=admin.execute(sql.SQL('SELECT caption,amount FROM {} WHERE id=%s').format(sql.Identifier(schema,'notes')),(alice,)).fetchone()
            check('quoted-default-exact-no-extra-statement',values == ("O'Reilly\\n%; SELECT 1;--",Decimal('12.30')))
            check('old-row-hidden-update-count',admin.execute(sql.SQL('UPDATE {} SET owner=%s WHERE id=%s').format(sql.Identifier(schema,'notes')),(alice,bob)).rowcount == 0)
            check('ordinary-update-owned-row',admin.execute(sql.SQL('UPDATE {} SET owner=%s WHERE id=%s').format(sql.Identifier(schema,'notes')),(alice,alice)).rowcount == 1)
            check('delete-own-child',admin.execute(sql.SQL('DELETE FROM {} WHERE id=%s').format(sql.Identifier(schema,'notes')),(alice,)).rowcount == 1)
        rejected=False
        try:
            with admin.transaction():
                admin.execute(sql.SQL('UPDATE {} SET parent_id=%s WHERE id=%s').format(sql.Identifier(schema,'notes')),('absent',bob))
        except psycopg.errors.ForeignKeyViolation:
            rejected=True
        check('native-foreign-key-even-for-admin',rejected)
        check('declared-covering-index-valid',admin.execute('SELECT i.indisvalid AND i.indnkeyatts=1 AND i.indnatts=2 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=\'owner_lookup\'',(schema,)).fetchone() == (True,))
        # FORCE applies even to the install owner; only the isolated admin bypasses it.
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            check('install-owner-forced-denied',admin.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(schema,'notes'))).fetchall() == [])
        check('cross-schema-create-not-granted',not admin.execute('SELECT pg_catalog.has_schema_privilege(%s,%s,\'CREATE\')',(alice,schema)).fetchone()[0])
        report={'scope':'initial inert compiler output; fixture executor, no production admission/migrations','serverVersion':admin.info.server_version,'psycopg':psycopg.__version__,'bundleDigest':bundle['bundleDigest'],'sourceDigest':bundle['sourceDigest'],'fixtureSha256':hashlib.sha256(args.bundle.read_bytes()).hexdigest(),'observations':observations,'nativeLifecycleReleaseQualified':False}
    finally:
        admin.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
        for role in reversed(created):
            admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'nativeAssertions':len(observations),'releaseQualified':False}))

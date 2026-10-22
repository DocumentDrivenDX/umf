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
from unittest.mock import patch

import psycopg
from psycopg import sql
from umf_codegen import verify_table_deployment
from umf_access.lifecycle import CatalogError, verify_native_catalog

parser = argparse.ArgumentParser()
parser.add_argument('--dsn', required=True)
parser.add_argument('--bundle', required=True, type=Path)
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()
bundle = json.loads(args.bundle.read_text())
assert verify_table_deployment(bundle) == bundle
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


def native_policy(connection, schema, table, name):
    return connection.execute('SELECT p.polcmd,p.polpermissive,p.polroles,pg_catalog.pg_get_expr(p.polqual,p.polrelid),pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),ARRAY(SELECT d.refclassid::pg_catalog.text||\':\'||d.refobjid::pg_catalog.text||\':\'||d.refobjsubid::pg_catalog.text||\':\'||d.deptype::pg_catalog.text FROM pg_catalog.pg_depend d WHERE d.classid=\'pg_catalog.pg_policy\'::pg_catalog.regclass AND d.objid=p.oid ORDER BY d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s AND p.polname=%s',(schema,table,name)).fetchone()


def source_policy_matches(connection, step):
    parts=step['sourcePath'].split('/')
    table=bundle['expectedCatalog']['tables'][int(parts[6])]['name']
    name='umf_'+parts[-2]+'_'+parts[-1]
    prefix='CREATE POLICY "'+name+'" '
    assert step['sql'].startswith(prefix)
    temporary='umf_verify_policy'
    expected_sql='CREATE POLICY "'+temporary+'" '+step['sql'][len(prefix):]
    with connection.transaction():
        connection.execute(expected_sql)
        result=native_policy(connection,schema,table,name) == native_policy(connection,schema,table,temporary)
        connection.execute(sql.SQL('DROP POLICY {} ON {}').format(sql.Identifier(temporary),sql.Identifier(schema,table)))
        return result

with psycopg.connect(args.dsn, autocommit=True) as admin:
    check('installed-original-compiler-verifies-source',True)
    check('native-major-18', admin.info.server_version // 10000 == 18)
    created = []
    schema_created = False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE').format(sql.Identifier(role)))
            created.append(role)
        for role in (alice,bob):
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE, SET FALSE').format(sql.Identifier(person),sql.Identifier(role)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(schema),sql.Identifier(owner)))
        schema_created = True
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            admin.execute('SET LOCAL search_path=pg_catalog')
            for step in bundle['steps']:
                admin.execute(step['sql'])
        tables = admin.execute('SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname=%s AND c.relkind=\'r\' ORDER BY c.relname',(schema,)).fetchall()
        check('both-tables-owned-and-forced-rls', tables == [('notes',True,True,owner),('parents',True,True,owner)])
        check('eight-command-policies-per-table',admin.execute('SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname=%s',(schema,)).fetchone()[0] == 16)
        refused=False
        try:
            verify_native_catalog(admin,bundle)
        except CatalogError as error:
            refused=str(error)=='transaction-required'
        check('catalog-requires-caller-owned-transaction',refused)
        for label,identity,path,read_only in [('person',alice,'pg_catalog',False),('batch',batch,'pg_catalog',False),('search-path',owner,'pg_catalog,public',False),('read-only',owner,'pg_catalog',True)]:
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(identity)))
                admin.execute('SET LOCAL search_path='+path)
                if read_only:
                    admin.execute('SET TRANSACTION READ ONLY')
                refused=False
                try:
                    verify_native_catalog(admin,bundle)
                except CatalogError as error:
                    refused=str(error)=='install-authority-required'
                check('catalog-refuses-unqualified-install-context-'+label,refused)
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            admin.execute('SET LOCAL search_path=pg_catalog')
            transaction_id=admin.execute('SELECT pg_catalog.pg_current_xact_id()::pg_catalog.text').fetchone()
            previous_timeouts=admin.execute("SELECT current_setting('statement_timeout'),current_setting('lock_timeout')").fetchone()
            forged=json.loads(json.dumps(bundle));forged['expectedCatalog']['columns'][0]['definitionSql']='injected text DEFAULT malicious()'
            refused=False
            try:
                verify_native_catalog(admin,forged)
            except CatalogError as error:
                refused=str(error)=='source-mismatch'
            check('catalog-rejects-supplied-expected-fingerprint',refused)
            verified=verify_native_catalog(admin,bundle)
            check('installed-catalog-verifier-source-shape-and-policies',verified == {'bundleDigest':bundle['bundleDigest'],'catalogShapeVerified':True,'lifecycleAdmission':False})
            check('catalog-verifier-does-not-commit-caller',admin.execute('SELECT pg_catalog.pg_current_xact_id()::pg_catalog.text').fetchone() == transaction_id)
            check('catalog-success-restores-timeouts',admin.execute("SELECT current_setting('statement_timeout'),current_setting('lock_timeout')").fetchone() == previous_timeouts)
            from psycopg.rows import dict_row
            previous_factory=admin.row_factory
            try:
                admin.row_factory=dict_row
                check('catalog-private-cursors-support-caller-dict-factory',verify_native_catalog(admin,bundle)['catalogShapeVerified'] is True)
                check('catalog-does-not-change-caller-row-factory',admin.execute('SELECT 1 AS value').fetchone() == {'value':1})
            finally:
                admin.row_factory=previous_factory
            note_key=next(k['name'] for k in bundle['expectedCatalog']['keys'] if k['table']=='notes' and k['primary'])
            for label,alteration in [
                ('native-type','ALTER COLUMN amount TYPE pg_catalog.numeric(8,2)'),
                ('nullability','ALTER COLUMN caption SET NOT NULL'),
                ('default',"ALTER COLUMN caption SET DEFAULT 'changed'"),
                ('extra-column','ADD COLUMN unexpected pg_catalog.text'),
                ('row-security','DISABLE ROW LEVEL SECURITY'),
                ('primary-key','DROP CONSTRAINT "'+note_key+'"'),
                ('check','DROP CONSTRAINT amount_nonnegative'),
                ('check-validation','DROP CONSTRAINT amount_nonnegative, ADD CONSTRAINT amount_nonnegative CHECK(amount>=0) NOT VALID'),
                ('foreign-key-action',f'DROP CONSTRAINT parent_fk, ADD CONSTRAINT parent_fk FOREIGN KEY(parent_id) REFERENCES "{schema}".parents(id) ON DELETE CASCADE'),
                ('index-order',f'DROP INDEX "{schema}".owner_lookup; CREATE INDEX owner_lookup ON "{schema}".notes USING btree(owner DESC) INCLUDE(caption)'),
                ('extra-index',f'CREATE INDEX unexpected_index ON "{schema}".notes USING btree(id)'),
                ('replica-identity','REPLICA IDENTITY FULL'),
                ('inheritance',f'INHERIT "{schema}".parents'),
                ('rewrite-rule',f'CREATE RULE hidden_insert AS ON INSERT TO "{schema}".notes DO INSTEAD NOTHING'),
            ]:
                with admin.transaction(force_rollback=True):
                    if label in ('index-order','extra-index','rewrite-rule'):
                        admin.execute(alteration)
                    else:
                        admin.execute(sql.SQL('ALTER TABLE {} '+alteration).format(sql.Identifier(schema,'notes')))
                    refused=False
                    try:
                        verify_native_catalog(admin,bundle)
                    except CatalogError:
                        refused=True
                    check('installed-catalog-'+label+'-drift-refuses',refused)
                    check('failed-catalog-verification-keeps-caller-healthy-'+label,admin.execute('SELECT 1').fetchone() == (1,))
                    check('failed-catalog-no-scratch-relation-'+label,admin.execute('SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname LIKE \'umf_verify_%%\'',(schema,)).fetchone() == (0,))
            check('installed-catalog-restores-original-after-controls',verify_native_catalog(admin,bundle)['catalogShapeVerified'] is True)
            internal_trigger=admin.execute("""SELECT t.tgname FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname=%s AND c.relname='notes' AND t.tgisinternal ORDER BY t.tgname LIMIT 1""",(schema,)).fetchone()[0]
            for mode in ('DISABLE','ENABLE ALWAYS'):
                with admin.transaction(force_rollback=True):
                    admin.execute('SET LOCAL ROLE NONE')
                    admin.execute(sql.SQL('ALTER TABLE {} '+mode+' TRIGGER {}').format(sql.Identifier(schema,'notes'),sql.Identifier(internal_trigger)))
                    admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                    refused=False
                    try:verify_native_catalog(admin,bundle)
                    except CatalogError as error:refused=str(error)=='catalog-mismatch'
                    check('constraint-trigger-mode-refuses-'+mode,refused)
                    check('constraint-trigger-refusal-keeps-caller-'+mode,admin.execute('SELECT 1').fetchone()==(1,))
        with psycopg.connect(args.dsn,autocommit=True) as blocker, blocker.transaction():
            blocker.execute(sql.SQL('LOCK TABLE {} IN ACCESS SHARE MODE').format(sql.Identifier(schema,'notes')))
            with admin.transaction():
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                admin.execute('SET LOCAL search_path=pg_catalog')
                previous=admin.execute("SELECT current_setting('statement_timeout'),current_setting('lock_timeout')").fetchone()
                refused=False
                try:
                    verify_native_catalog(admin,bundle,lock_timeout_ms=50)
                except CatalogError as error:
                    refused=str(error)=='catalog-verification-failed'
                check('catalog-lock-wait-is-bounded',refused)
                check('catalog-timeout-preserves-caller-transaction',admin.execute('SELECT 1').fetchone() == (1,))
                check('catalog-failure-restores-timeouts',admin.execute("SELECT current_setting('statement_timeout'),current_setting('lock_timeout')").fetchone() == previous)
        policy_steps=[step for step in bundle['steps'] if step['kind']=='policy']
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            admin.execute('SET LOCAL search_path=pg_catalog')
            for table in bundle['expectedCatalog']['tables']:
                admin.execute(sql.SQL('LOCK TABLE {} IN ACCESS EXCLUSIVE MODE').format(sql.Identifier(schema,table['name'])))
            for step in policy_steps:
                check('native-policy-source-reparse-'+step['id'],source_policy_matches(admin,step))
            select_step=next(s for s in policy_steps if s['sourcePath'].endswith('/tables/0/policy/person/select'))
            for label,alteration in [('predicate','USING (true)'),('audience','TO PUBLIC')]:
                with admin.transaction(force_rollback=True):
                    admin.execute(sql.SQL('ALTER POLICY umf_person_select ON {} '+alteration).format(sql.Identifier(schema,'notes')))
                    check('native-policy-'+label+'-drift-refuses',not source_policy_matches(admin,select_step))
                    refused=False
                    try:
                        verify_native_catalog(admin,bundle)
                    except CatalogError as error:
                        refused=str(error)=='catalog-mismatch'
                    check('installed-catalog-policy-'+label+'-drift-refuses',refused)
            for label,before,after in [('mode','AS PERMISSIVE','AS RESTRICTIVE'),('command','FOR SELECT','FOR DELETE')]:
                with admin.transaction(force_rollback=True):
                    admin.execute(sql.SQL('DROP POLICY umf_person_select ON {}').format(sql.Identifier(schema,'notes')))
                    admin.execute(select_step['sql'].replace(before,after,1))
                    check('native-policy-'+label+'-drift-refuses',not source_policy_matches(admin,select_step))
                    refused=False
                    try:
                        verify_native_catalog(admin,bundle)
                    except CatalogError as error:
                        refused=str(error)=='catalog-mismatch'
                    check('installed-catalog-policy-'+label+'-drift-refuses',refused)
            with admin.transaction(force_rollback=True):
                admin.execute(sql.SQL('CREATE POLICY unexpected_policy ON {} FOR SELECT TO PUBLIC USING(true)').format(sql.Identifier(schema,'notes')))
                refused=False
                try:
                    verify_native_catalog(admin,bundle)
                except CatalogError as error:
                    refused=str(error)=='catalog-mismatch'
                check('installed-catalog-extra-policy-refuses',refused)
            failed=False
            with patch(__name__+'.native_policy',side_effect=lambda connection,*_: connection.execute('SELECT 1/0')):
                try:
                    source_policy_matches(admin,select_step)
                except psycopg.errors.DivisionByZero:
                    failed=True
            check('scratch-verification-failure-restores-savepoint',failed)
            check('original-policy-after-failed-verification',source_policy_matches(admin,select_step))
        check('no-verification-policy-survives',admin.execute('SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname=%s AND policyname=\'umf_verify_policy\'',(schema,)).fetchone()[0] == 0)
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
        if schema_created:
            admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        for role in reversed(created):
            admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'nativeAssertions':len(observations),'releaseQualified':False}))

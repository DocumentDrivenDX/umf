# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed source ACL and dedicated-schema checks on synthetic PostgreSQL18."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import psycopg
from psycopg import sql
from umf_access.lifecycle import CatalogError, verify_native_privileges

parser=argparse.ArgumentParser()
parser.add_argument('--dsn',required=True)
parser.add_argument('--bundle',required=True,type=Path)
parser.add_argument('--report',required=True,type=Path)
args=parser.parse_args()
bundle=json.loads(args.bundle.read_text())
cfg=bundle['configuration']
schema,owner,person,batch=(cfg[k] for k in ('schema','ownerRole','personRole','batchRole'))
group=cfg['groupRoles']['readers']
assert all(re.fullmatch(r'p2_[a-f0-9]{12}_(schema|owner|person|batch|readers)',n) for n in (schema,owner,person,batch,group))
alice,bob=owner+'_alice',owner+'_bob'
external=schema+'_external'
roles=[owner,person,batch,group,alice,bob]
observations=[]


def check(name,condition):
    assert condition,name
    observations.append(name)


def qualify(connection):
    return verify_native_privileges(connection,bundle,person_roles=(alice,bob))


with psycopg.connect(args.dsn,autocommit=True) as admin:
    created=[]
    schemas=[]
    large_object=None
    wrapper_created=False
    server_created=False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)))
            created.append(role)
        for role in (alice,bob):
            admin.execute(sql.SQL('GRANT {} TO {} WITH INHERIT TRUE, SET FALSE').format(sql.Identifier(person),sql.Identifier(role)))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(schema),sql.Identifier(owner)))
        schemas.append(schema)
        admin.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(external)))
        schemas.append(external)
        admin.execute(sql.SQL('CREATE TABLE {}(value pg_catalog.text)').format(sql.Identifier(external,'data')))
        admin.execute(sql.SQL('CREATE SEQUENCE {}').format(sql.Identifier(external,'sequence')))
        admin.execute(sql.SQL('CREATE FUNCTION {}() RETURNS pg_catalog.int4 LANGUAGE SQL IMMUTABLE AS $$SELECT 1$$').format(sql.Identifier(external,'routine')))
        admin.execute(sql.SQL('REVOKE ALL ON FUNCTION {}() FROM PUBLIC').format(sql.Identifier(external,'routine')))
        large_object=admin.execute('SELECT pg_catalog.lo_create(0)').fetchone()[0]
        admin.execute(sql.SQL('CREATE FOREIGN DATA WRAPPER {} NO HANDLER NO VALIDATOR').format(sql.Identifier(external)))
        wrapper_created=True
        admin.execute(sql.SQL('CREATE SERVER {} FOREIGN DATA WRAPPER {}').format(sql.Identifier(external),sql.Identifier(external)))
        server_created=True
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            admin.execute('SET LOCAL search_path=pg_catalog')
            for step in bundle['steps']:
                admin.execute(step['sql'])
            before=admin.execute('SELECT pg_catalog.pg_current_xact_id()::pg_catalog.text').fetchone()
            timeouts=admin.execute("SELECT current_setting('statement_timeout'),current_setting('lock_timeout')").fetchone()
            result=qualify(admin)
            check('source-native-privileges-qualify',result=={'bundleDigest':bundle['bundleDigest'],'nativePrivilegesVerified':True,'verifiedPersonRoles':[alice,bob],'lifecycleAdmission':False})
            check('privileges-retain-caller-xid',before==admin.execute('SELECT pg_catalog.pg_current_xact_id()::pg_catalog.text').fetchone())
            check('privileges-restore-caller-timeouts',timeouts==admin.execute("SELECT current_setting('statement_timeout'),current_setting('lock_timeout')").fetchone())
            check('privileges-leave-no-scratch',admin.execute('SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace=%s::pg_catalog.regnamespace AND relname LIKE \'umf_verify_%%\'',(schema,)).fetchone()==(0,))
            from psycopg.rows import dict_row
            previous=admin.row_factory
            try:
                admin.row_factory=dict_row
                check('privileges-private-tuple-cursors',qualify(admin)['nativePrivilegesVerified'])
                check('privileges-preserve-caller-dict-factory',admin.execute('SELECT 1 AS value').fetchone()=={'value':1})
            finally:
                admin.row_factory=previous
        changes=[
            ('extra-truncate',sql.SQL('GRANT TRUNCATE ON {} TO {}').format(sql.Identifier(schema,'notes'),sql.Identifier(person))),
            ('extra-maintain',sql.SQL('GRANT MAINTAIN ON {} TO {}').format(sql.Identifier(schema,'notes'),sql.Identifier(batch))),
            ('public-data',sql.SQL('GRANT SELECT ON {} TO PUBLIC').format(sql.Identifier(schema,'notes'))),
            ('group-data',sql.SQL('GRANT SELECT ON {} TO {}').format(sql.Identifier(schema,'notes'),sql.Identifier(group))),
            ('direct-person-data',sql.SQL('GRANT SELECT ON {} TO {}').format(sql.Identifier(schema,'notes'),sql.Identifier(alice))),
            ('grant-option',sql.SQL('GRANT SELECT ON {} TO {} WITH GRANT OPTION').format(sql.Identifier(schema,'notes'),sql.Identifier(person))),
            ('immutable-column',sql.SQL('GRANT UPDATE(id) ON {} TO {}').format(sql.Identifier(schema,'notes'),sql.Identifier(person))),
            ('missing-mutable-column',sql.SQL('REVOKE UPDATE(caption) ON {} FROM {}').format(sql.Identifier(schema,'notes'),sql.Identifier(person))),
            ('public-column',sql.SQL('GRANT SELECT(caption) ON {} TO PUBLIC').format(sql.Identifier(schema,'notes'))),
            ('schema-create',sql.SQL('GRANT CREATE ON SCHEMA {} TO {}').format(sql.Identifier(schema),sql.Identifier(person))),
            ('schema-public',sql.SQL('GRANT USAGE ON SCHEMA {} TO PUBLIC').format(sql.Identifier(schema))),
            ('schema-grant-option',sql.SQL('GRANT USAGE ON SCHEMA {} TO {} WITH GRANT OPTION').format(sql.Identifier(schema),sql.Identifier(batch))),
            ('missing-schema-usage',sql.SQL('REVOKE USAGE ON SCHEMA {} FROM {}').format(sql.Identifier(schema),sql.Identifier(batch))),
            ('default-public',sql.SQL('ALTER DEFAULT PRIVILEGES FOR ROLE {} GRANT SELECT ON TABLES TO PUBLIC').format(sql.Identifier(owner))),
            ('default-column-audience',sql.SQL('ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA {} GRANT SELECT ON TABLES TO {}').format(sql.Identifier(owner),sql.Identifier(schema),sql.Identifier(group))),
            ('extra-relation',sql.SQL('CREATE TABLE {}(value text)').format(sql.Identifier(schema,'unexpected'))),
            ('root-database-create',sql.SQL('GRANT CREATE ON DATABASE {} TO {}').format(sql.Identifier(admin.info.dbname),sql.Identifier(owner))),
            ('public-external-function',sql.SQL('GRANT EXECUTE ON FUNCTION {}() TO PUBLIC').format(sql.Identifier(external,'routine'))),
        ]
        for root in (owner,person,batch):
            changes.extend([
                ('external-table-'+root,sql.SQL('GRANT SELECT ON {} TO {}').format(sql.Identifier(external,'data'),sql.Identifier(root))),
                ('external-column-'+root,sql.SQL('GRANT SELECT(value) ON {} TO {}').format(sql.Identifier(external,'data'),sql.Identifier(root))),
                ('external-sequence-'+root,sql.SQL('GRANT USAGE ON SEQUENCE {} TO {}').format(sql.Identifier(external,'sequence'),sql.Identifier(root))),
                ('external-schema-create-'+root,sql.SQL('GRANT CREATE ON SCHEMA {} TO {}').format(sql.Identifier(external),sql.Identifier(root))),
                ('external-function-'+root,sql.SQL('GRANT EXECUTE ON FUNCTION {}() TO {}').format(sql.Identifier(external,'routine'),sql.Identifier(root))),
                ('external-largeobject-'+root,sql.SQL('GRANT SELECT ON LARGE OBJECT {} TO {}').format(sql.Literal(large_object),sql.Identifier(root))),
                ('external-server-'+root,sql.SQL('GRANT USAGE ON FOREIGN SERVER {} TO {}').format(sql.Identifier(external),sql.Identifier(root))),
                ('external-wrapper-'+root,sql.SQL('GRANT USAGE ON FOREIGN DATA WRAPPER {} TO {}').format(sql.Identifier(external),sql.Identifier(root))),
            ])
        for label,statement in changes:
            with admin.transaction(force_rollback=True):
                admin.execute(statement)
                admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                admin.execute('SET LOCAL search_path=pg_catalog')
                try:
                    qualify(admin)
                except CatalogError as error:
                    check('native-privilege-drift-refuses-'+label,str(error) in ('privilege-mismatch','external-authority-present','default-privilege-mismatch','catalog-mismatch'))
                else:
                    raise AssertionError('drift admitted: '+label)
                check('privilege-refusal-keeps-caller-healthy-'+label,admin.execute('SELECT 1').fetchone()==(1,))
                check('privilege-refusal-leaves-no-scratch-'+label,admin.execute('SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace=%s::pg_catalog.regnamespace AND relname LIKE \'umf_verify_%%\'',(schema,)).fetchone()==(0,))
        with admin.transaction():
            admin.execute(sql.SQL('GRANT SELECT ON {} TO {}').format(sql.Identifier(external,'data'),sql.Identifier(alice)))
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            admin.execute('SET LOCAL search_path=pg_catalog')
            check('actual-person-may-have-another-plugin-grant',qualify(admin)['nativePrivilegesVerified'])
        report={'scope':'administrative source ACL, selected role and root schema containment; no installed ledger or data admission','serverVersion':admin.info.server_version,'psycopg':psycopg.__version__,'bundleDigest':bundle['bundleDigest'],'fixtureBundleSha256':hashlib.sha256(args.bundle.read_bytes()).hexdigest(),'observations':observations,'nativeLifecycleReleaseQualified':False}
    finally:
        if large_object is not None:
            admin.execute('SELECT pg_catalog.lo_unlink(%s)',(large_object,))
        if server_created:
            admin.execute(sql.SQL('DROP SERVER {}').format(sql.Identifier(external)))
        if wrapper_created:
            admin.execute(sql.SQL('DROP FOREIGN DATA WRAPPER {}').format(sql.Identifier(external)))
        for owned in reversed(schemas):
            admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(owned)))
        for role in reversed(created):
            admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'nativeAssertions':len(observations),'releaseQualified':False}))

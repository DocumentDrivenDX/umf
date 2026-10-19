# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed administrative role scope on an isolated synthetic PostgreSQL18."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import psycopg
from psycopg import sql
from umf_access.lifecycle import CatalogError, verify_native_role_scope

parser = argparse.ArgumentParser()
parser.add_argument('--dsn', required=True)
parser.add_argument('--bundle', required=True, type=Path)
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()
bundle = json.loads(args.bundle.read_text())
cfg = bundle['configuration']
schema, owner, person, batch = (cfg[key] for key in ('schema','ownerRole','personRole','batchRole'))
group = cfg['groupRoles']['readers']
assert all(re.fullmatch(r'p2_[a-f0-9]{12}_(schema|owner|person|batch|readers)', name) for name in (schema,owner,person,batch,group))
alice, bob, outsider, issuer, bridge, bridge2 = (owner+suffix for suffix in ('_alice','_bob','_outsider','_issuer','_bridge','_bridge2'))
roles = [owner,person,batch,group,alice,bob,outsider,issuer,bridge,bridge2]
observations = []


def check(name, condition):
    assert condition, name
    observations.append(name)


def grant(target, member, inherit=True, switch=False):
    return sql.SQL('GRANT {} TO {} WITH INHERIT {}, SET {}').format(
        sql.Identifier(target),sql.Identifier(member),sql.SQL(str(inherit).upper()),sql.SQL(str(switch).upper()))


class Rollback(Exception):
    pass


with psycopg.connect(args.dsn, autocommit=True) as admin:
    created = []
    schema_created = False
    try:
        for role in roles:
            admin.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(role)))
            created.append(role)
        admin.execute(sql.SQL('ALTER ROLE {} LOGIN').format(sql.Identifier(issuer)))
        for role in (alice,bob):
            admin.execute(grant(person,role))
        admin.execute(grant(group,bob,False,False))
        admin.execute(grant(person,issuer,False,True))
        admin.execute(grant(batch,issuer,False,True))
        admin.execute(sql.SQL('CREATE SCHEMA {} AUTHORIZATION {}').format(sql.Identifier(schema),sql.Identifier(owner)))
        schema_created = True
        check('native-major18',admin.info.server_version // 10000 == 18)
        with admin.transaction():
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            admin.execute('SET LOCAL search_path=pg_catalog')
            transaction_id = admin.execute('SELECT pg_catalog.pg_current_xact_id()::pg_catalog.text').fetchone()
            timeouts = admin.execute("SELECT current_setting('statement_timeout'),current_setting('lock_timeout')").fetchone()
            result = verify_native_role_scope(admin,bundle,person_roles=(alice,bob))
            check('selected-persons-and-independent-batch-role-qualify',result == {'bundleDigest':bundle['bundleDigest'],'roleScopeVerified':True,'verifiedPersonRoles':[alice,bob],'lifecycleAdmission':False})
            check('batch-only-role-scope-needs-no-person',verify_native_role_scope(admin,bundle,person_roles=())['verifiedPersonRoles'] == [])
            check('issuer-can-switch-person-and-batch-without-being-a-person',admin.execute("SELECT pg_has_role(%s,%s,'SET'),pg_has_role(%s,%s,'SET')",(issuer,person,issuer,batch)).fetchone() == (True,True))
            check('role-verifier-retains-caller-xid',transaction_id == admin.execute('SELECT pg_catalog.pg_current_xact_id()::pg_catalog.text').fetchone())
            check('role-verifier-restores-timeouts',timeouts == admin.execute("SELECT current_setting('statement_timeout'),current_setting('lock_timeout')").fetchone())
            from psycopg.rows import dict_row
            previous = admin.row_factory
            try:
                admin.row_factory = dict_row
                check('role-verifier-supports-private-tuple-cursors',verify_native_role_scope(admin,bundle,person_roles=(alice,))['roleScopeVerified'])
                check('role-verifier-preserves-caller-dict-factory',admin.execute('SELECT 1 AS value').fetchone() == {'value':1})
            finally:
                admin.row_factory = previous
            for label, selected in [('not-a-person',(outsider,)),('issuer-is-not-person',(issuer,)),('umbrella-is-not-person',(person,)),('missing-person',(owner+'_missing',))]:
                try:
                    verify_native_role_scope(admin,bundle,person_roles=selected)
                except CatalogError as error:
                    check(label,str(error) in ('person-identity-required','role-scope-mismatch'))
                else:
                    raise AssertionError(label)
            for selected in [None,(alice,alice),[alice],('',),('x'*64,)]:
                try:
                    verify_native_role_scope(admin,bundle,person_roles=selected)
                except ValueError:
                    check('invalid-person-inventory-refuses-'+str(len(observations)),True)
                else:
                    raise AssertionError('invalid inventory')
        mutations = [
            ('person-inherits-batch',[grant(batch,alice)]),
            ('person-set-only-batch',[grant(batch,alice,False,True)]),
            ('person-transitive-inherited-batch',[grant(bridge,alice),grant(batch,bridge)]),
            ('person-switch-then-inherit-batch',[grant(bridge,alice,False,True),grant(batch,bridge)]),
            ('person-switch-chain-to-owner',[grant(bridge,alice,False,True),grant(bridge2,bridge,False,True),grant(owner,bridge2,False,True)]),
            ('batch-inherits-person',[grant(person,batch)]),
            ('batch-transitive-set-owner',[grant(bridge,batch,False,True),grant(owner,bridge,False,True)]),
            ('umbrella-inherits-batch',[grant(batch,person)]),
            ('group-switches-batch',[grant(batch,group,False,True)]),
            ('owner-inherits-unrelated-role',[grant(bridge,owner)]),
            ('person-bypassrls',[sql.SQL('ALTER ROLE {} BYPASSRLS').format(sql.Identifier(alice))]),
            ('person-createrole',[sql.SQL('ALTER ROLE {} CREATEROLE').format(sql.Identifier(alice))]),
            ('person-createdb',[sql.SQL('ALTER ROLE {} CREATEDB').format(sql.Identifier(alice))]),
            ('person-replication',[sql.SQL('ALTER ROLE {} REPLICATION').format(sql.Identifier(alice))]),
            ('person-superuser',[sql.SQL('ALTER ROLE {} SUPERUSER').format(sql.Identifier(alice))]),
            ('transitive-bypass-role',[sql.SQL('ALTER ROLE {} BYPASSRLS').format(sql.Identifier(bridge)),grant(bridge,alice,False,True)]),
            ('batch-login',[sql.SQL('ALTER ROLE {} LOGIN').format(sql.Identifier(batch))]),
            ('group-login',[sql.SQL('ALTER ROLE {} LOGIN').format(sql.Identifier(group))]),
            ('person-has-only-set-audience',[grant(person,alice,False,True)]),
            ('disabled-admin-edge-can-regrant-batch',[sql.SQL('GRANT {} TO {} WITH ADMIN TRUE, INHERIT FALSE, SET FALSE').format(sql.Identifier(batch),sql.Identifier(alice))]),
            ('transitive-role-admin-authority',[sql.SQL('GRANT {} TO {} WITH ADMIN TRUE, INHERIT FALSE, SET FALSE').format(sql.Identifier(batch),sql.Identifier(bridge)),grant(bridge,alice)]),
            ('predefined-all-data-role',[grant('pg_read_all_data',alice)]),
        ]
        for label, statements in mutations:
            try:
                with admin.transaction():
                    for statement in statements:
                        admin.execute(statement)
                    admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
                    admin.execute('SET LOCAL search_path=pg_catalog')
                    try:
                        verify_native_role_scope(admin,bundle,person_roles=(alice,bob))
                    except CatalogError as error:
                        check('native-role-drift-refuses-'+label,str(error) in ('role-scope-mismatch','person-identity-required'))
                    else:
                        raise AssertionError('drift admitted: '+label)
                    check('caller-healthy-after-role-refusal-'+label,admin.execute('SELECT 1').fetchone() == (1,))
                    raise Rollback
            except Rollback:
                pass
        # Native permission semantics: disabled edges do not make an effective
        # audience path, and legitimate person membership can span other plugins.
        with admin.transaction():
            admin.execute(grant(batch,alice,False,False))
            admin.execute(grant(bridge,bob))
            admin.execute(grant(bridge2,bridge,False,False))
            admin.execute(grant(batch,bridge2))
            admin.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(owner)))
            admin.execute('SET LOCAL search_path=pg_catalog')
            check('disabled-edges-and-unrelated-plugin-role-are-not-escalation',verify_native_role_scope(admin,bundle,person_roles=(alice,bob))['roleScopeVerified'])
        report = {'scope':'selected native role reachability only; ACL/schema containment, ledger and data admission remain open','serverVersion':admin.info.server_version,'psycopg':psycopg.__version__,'bundleDigest':bundle['bundleDigest'],'fixtureBundleSha256':hashlib.sha256(args.bundle.read_bytes()).hexdigest(),'observations':observations,'nativeLifecycleReleaseQualified':False}
    finally:
        if schema_created:
            admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        for role in reversed(created):
            admin.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'nativeAssertions':len(observations),'releaseQualified':False}))

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Owned-local test deployment of exact original compiler fence programs.

This is fixture setup, never SDK admission or production deployment machinery.
"""

from psycopg import sql

CATALOGS = (
    'pg_namespace', 'pg_proc', 'pg_ts_config', 'pg_ts_config_map',
    'pg_ts_dict', 'pg_ts_parser', 'pg_ts_template',
)


def deploy_owned_fence(admin, artifacts):
    native = admin.info.get_parameters()
    if admin.info.server_version != 180006 or native.get('user') != 'sdk_test' or not native.get('host', '').startswith('/private/tmp/') or native.get('port') not in ('55494', '55513'):
        raise ValueError('dedicated owned local PG18.6 fixture required')
    fences = [artifact['obligations']['nativeCatalogFence'] for artifact in artifacts if 'nativeCatalogFence' in artifact['obligations']]
    if not fences:
        raise ValueError('actual original fence artifacts required')
    first = fences[0]
    descriptor = first['deployment']
    if descriptor != {'version': 'umf.pg-ts-fence/0.1', 'schema': 'native_fence', 'view': 'ts_catalog_lock', 'owner': 'fence_owner', 'ownerProfile': 'non-login-maintainer/0.1'}:
        raise ValueError('explicit authored fixture fence descriptor differs')
    plan = first['deploymentProgram']
    if any(fence['deployment'] != descriptor or fence['deploymentProgram'] != plan for fence in fences):
        raise ValueError('selected original deployments differ')
    expected_owner = {'role': 'fence_owner', 'superuser': False, 'bypassRls': False, 'login': False, 'createRole': False, 'createDb': False, 'replication': False, 'schemaOwner': True, 'catalogMaintain': ['pg_catalog.' + name for name in CATALOGS]}
    if plan['version'] != 'weft.pg-ts-fence-deployment/0.1' or plan['ownerPrerequisites'] != expected_owner or plan['readerPrerequisites'] != {'schemaUsage': True, 'viewMaintain': True, 'ownerMembership': False}:
        raise ValueError('original fixture deployment prerequisites differ')
    admin.execute('CREATE ROLE fence_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION')
    admin.execute('CREATE SCHEMA native_fence AUTHORIZATION fence_owner')
    # These exact strings originate in the checked original compiler artifact.
    admin.execute(plan['createViewSql'])
    admin.execute(plan['alterOwnerSql'])
    for name in CATALOGS:
        admin.execute(sql.SQL('GRANT MAINTAIN ON pg_catalog.{} TO fence_owner').format(sql.Identifier(name)))
    admin.execute('GRANT USAGE ON SCHEMA native_fence TO search_user')
    admin.execute('GRANT MAINTAIN ON native_fence.ts_catalog_lock TO search_user')
    owner = admin.execute("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin,rolcreaterole,rolcreatedb,rolreplication FROM pg_catalog.pg_roles WHERE rolname='fence_owner'").fetchone()
    assert owner == ('fence_owner', False, False, False, False, False, False)
    permissions = admin.execute("SELECT pg_catalog.has_table_privilege('search_user','native_fence.ts_catalog_lock','MAINTAIN'),pg_catalog.has_table_privilege('search_user','native_fence.ts_catalog_lock','SELECT'),pg_catalog.pg_has_role('search_user','fence_owner','MEMBER')").fetchone()
    assert permissions == (True, False, False)
    return {
        'originalFence': first,
        'hostAuthoredDescriptor': descriptor,
        'hostGrantStatements': ['GRANT MAINTAIN ON pg_catalog.' + name + ' TO fence_owner' for name in CATALOGS] + ['GRANT USAGE ON SCHEMA native_fence TO search_user', 'GRANT MAINTAIN ON native_fence.ts_catalog_lock TO search_user'],
        'observedOwnerRole': owner,
        'observedReaderMaintainSelectOwnerMembership': permissions,
        'scope': 'owned-local test deployment metadata; no core extension or managed profile qualification',
        'nativeAuthority': False,
    }

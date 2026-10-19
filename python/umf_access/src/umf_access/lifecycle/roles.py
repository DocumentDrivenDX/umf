# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native role reachability for explicitly selected person identities.

This administrative check does not infer people from all role memberships:
trusted pool issuers can intentionally issue both person and batch sessions.
ACL containment and runtime admission remain separate requirements.
"""
from __future__ import annotations

from typing import Any

from .catalog import CatalogError, _installation
from .probe import _Query, _run

_CLOSURE = """WITH switched AS MATERIALIZED (
 SELECT oid FROM pg_catalog.pg_roles WHERE pg_catalog.pg_has_role(%s::pg_catalog.oid,oid,'SET'))
SELECT r.oid,r.rolname,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication
FROM pg_catalog.pg_roles r WHERE EXISTS (
 SELECT FROM switched s WHERE pg_catalog.pg_has_role(s.oid,r.oid,'USAGE'))"""


def verify_native_role_scope(connection: Any, bundle: dict[str, object], *,
                             person_roles: tuple[str, ...],
                             statement_timeout_ms: int = 30_000,
                             lock_timeout_ms: int = 5_000) -> dict[str, object]:
    """Verify exact selected people and configured role boundaries, without ACL admission.

    The trusted host must supply its actual person registry, excluding its pool
    issuer. Each selected person must inherit the person audience as that person;
    SET-only membership cannot substitute an umbrella identity for them. Checks
    include SET reachability followed by inherited privileges, not MEMBER alone.
    The caller owns the install transaction; no commit or role mutation occurs.
    """
    if (type(person_roles) is not tuple or len(person_roles) > 1024
            or any(type(role) is not str or not role or '\0' in role
                   or len(role.encode('utf-8')) > 63 for role in person_roles)
            or len(set(person_roles)) != len(person_roles)):
        raise ValueError("an exact tuple of at most 1024 distinct person roles is required")
    with _installation(connection, bundle, statement_timeout_ms=statement_timeout_ms,
                       lock_timeout_ms=lock_timeout_ms) as source:
        _run(connection,_role_scope_steps(source,person_roles))
    return {"bundleDigest": source["bundleDigest"], "roleScopeVerified": True,
            "verifiedPersonRoles": list(person_roles), "lifecycleAdmission": False}


def _role_scope_steps(source, person_roles, batch_roles=()):
    cfg = source['configuration']
    owner, person, batch = (cfg[key] for key in ('ownerRole', 'personRole', 'batchRole'))
    groups = list(cfg['groupRoles'].values())
    configured = [owner, person, batch, *groups]
    if set(configured).intersection(person_roles):
        raise CatalogError('person-identity-required')
    if set(batch_roles).intersection(set(configured)-{batch}) or set(batch_roles).intersection(person_roles):
        raise CatalogError('batch-identity-required')
    selected = sorted(set(configured)|set(person_roles)|set(batch_roles))
    identities: dict[str, int] = {}
    login = {}
    for name in selected:
        row = (yield _Query('one', 'SELECT oid,rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=%s', (name,)))
        if row is None or (name in configured and row[1]):
            raise CatalogError('role-scope-mismatch')
        identities[name] = row[0]
        login[name] = row[1]
    facts = []
    for name in selected:
        effective = (yield _Query('all', _CLOSURE, (identities[name],)))
        if len(effective) > 4096:
            raise CatalogError('role-scope-capacity')
        if not effective or any(any(row[2:]) or row[1].startswith('pg_') for row in effective):
            raise CatalogError('role-scope-mismatch')
        administrators = (yield _Query('one', 'SELECT EXISTS (SELECT FROM pg_catalog.pg_auth_members WHERE member=ANY(%s::pg_catalog.oid[]) AND admin_option)', ([row[0] for row in effective],)))
        if administrators != (False,):
            raise CatalogError('role-scope-mismatch')
        for row in effective:
            if (yield _Query('one', "SELECT pg_catalog.has_parameter_privilege(%s::pg_catalog.oid,'session_replication_role','SET')", (row[0],))) != (False,):
                raise CatalogError('role-scope-mismatch')
        reached = {row[1] for row in effective}
        forbidden = {owner, person} if name == batch or name in batch_roles else {owner, batch}
        if name == owner:
            if reached != {owner}:
                raise CatalogError('role-scope-mismatch')
        elif reached.intersection(forbidden):
            raise CatalogError('role-scope-mismatch')
        if name in person_roles:
            inherits = (yield _Query('one', "SELECT pg_catalog.pg_has_role(%s::pg_catalog.oid,%s::pg_catalog.oid,'USAGE')", (identities[name], identities[person])))
            if inherits != (True,):
                raise CatalogError('person-identity-required')
        if name in batch_roles:
            inherits = (yield _Query('one', "SELECT pg_catalog.pg_has_role(%s::pg_catalog.oid,%s::pg_catalog.oid,'USAGE')", (identities[name],identities[batch])))
            if inherits != (True,):
                raise CatalogError('batch-identity-required')
        members = yield _Query('all',"SELECT oid,rolname FROM pg_catalog.pg_roles WHERE pg_catalog.pg_has_role(%s::pg_catalog.oid,oid,'MEMBER') ORDER BY oid LIMIT 4097",(identities[name],))
        if len(members)>4096:
            raise CatalogError('role-scope-capacity')
        facts.append([name,identities[name],login[name],sorted(effective,key=lambda row:row[0]),members])
    return {'identities':identities,'facts':facts}

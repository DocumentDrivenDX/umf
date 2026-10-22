# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source-bound approval values for host-owned migration custody.

These values describe an approval binding; constructing them is not approval.
Only a host-authenticated adapter may persist and return an approval receipt.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import uuid4

from .catalog import (
    CatalogError,
    _all,
    _columns,
    _constraint_shapes,
    _execute,
    _index_shapes,
    _one,
    _q,
)

APPROVAL_PROFILE = {
    "version": "umf.table-migration-approval/0.1",
    "relation": "umf_lifecycle_approvals",
    "ownerOnly": True,
}
APPROVAL_BINDING_VERSION = "umf.table-migration-approval-binding/0.1"
_HEX_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_APPROVAL_DEFINITIONS = [
    '"approval_id" pg_catalog.uuid NOT NULL',
    '"binding_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"binding" pg_catalog.jsonb NOT NULL',
    '"decision" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"decider" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"decided_at" pg_catalog.timestamptz NOT NULL',
    '"qualification_profile" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"evidence_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
]
_APPROVAL_CONSTRAINTS = [
    ("umf_lifecycle_approvals_pkey", 'PRIMARY KEY ("approval_id")'),
    ("approval_binding_unique", 'UNIQUE ("binding_digest")'),
    ("approval_binding_digest", 'CHECK ("binding_digest" ~ \'^[a-f0-9]{64}$\')'),
    ("approval_binding_object", 'CHECK (pg_catalog.jsonb_typeof("binding")=\'object\')'),
    ("approval_decision", 'CHECK ("decision" IN (\'approved\',\'denied\'))'),
    ("approval_decider", 'CHECK ("decider"<>\'\')'),
    ("approval_profile", 'CHECK ("qualification_profile"<>\'\')'),
    ("approval_evidence_digest", 'CHECK ("evidence_digest" ~ \'^[a-f0-9]{64}$\')'),
]
_APPROVAL_STATE = """SELECT c.relkind,c.relpersistence,r.rolname,c.relrowsecurity,c.relforcerowsecurity,
c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident,
EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
EXISTS(SELECT FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid),
EXISTS(SELECT FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),r.oid,c.oid,c.relam,
EXISTS(SELECT FROM pg_catalog.pg_depend d WHERE d.refclassid='pg_catalog.pg_class'::pg_catalog.regclass
AND d.refobjid=c.oid AND NOT (d.classid='pg_catalog.pg_class'::pg_catalog.regclass
AND EXISTS(SELECT FROM pg_catalog.pg_class dep WHERE dep.oid=d.objid AND dep.relkind='i'
AND dep.relnamespace=c.relnamespace)) AND NOT (d.classid='pg_catalog.pg_constraint'::pg_catalog.regclass
AND EXISTS(SELECT FROM pg_catalog.pg_constraint k WHERE k.oid=d.objid AND k.conrelid=c.oid))
AND d.deptype NOT IN ('i','a'))
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname=%s AND c.relname=%s"""


def _canonical(value: Any) -> bytes:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, UnicodeError):
        raise CatalogError("approval-binding-invalid") from None


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _require_digest(value: Any, *, nullable: bool = False) -> str | None:
    if nullable and value is None:
        return None
    if type(value) is not str or _HEX_DIGEST.fullmatch(value) is None:
        raise CatalogError("approval-binding-invalid")
    return value


@dataclass(frozen=True, slots=True)
class TargetIdentity:
    """Stable non-secret identity for one installed database target."""

    engine: str
    profile: str
    installation_id: str
    database_oid: int
    database: str
    schema: str
    module: str
    owner_role: str

    def as_json(self) -> dict[str, Any]:
        if (self.engine != "postgresql" or not self.profile or not self.installation_id
                or type(self.database_oid) is not int or self.database_oid <= 0
                or any(type(value) is not str or not value for value in
                       (self.database, self.schema, self.module, self.owner_role))):
            raise CatalogError("approval-target-identity-invalid")
        return {
            "engine": self.engine,
            "profile": self.profile,
            "installationId": self.installation_id,
            "databaseOid": self.database_oid,
            "database": self.database,
            "schema": self.schema,
            "module": self.module,
            "ownerRole": self.owner_role,
        }

    @property
    def digest(self) -> str:
        return _digest(self.as_json())


@dataclass(frozen=True, slots=True)
class ApprovalBinding:
    """Exact plan and predecessor binding presented for host approval."""

    target: TargetIdentity
    migration_id: str
    plan_digest: str
    file_digest: str
    source_bundle_digest: str
    expected_head: str | None
    phase_digests: tuple[str, ...]
    qualification_profile: str
    evidence_digest: str

    def as_json(self) -> dict[str, Any]:
        if (type(self.migration_id) is not str or not self.migration_id
                or not isinstance(self.target, TargetIdentity)
                or type(self.phase_digests) is not tuple
                or type(self.qualification_profile) is not str or not self.qualification_profile):
            raise CatalogError("approval-binding-invalid")
        return {
            "version": APPROVAL_BINDING_VERSION,
            "target": self.target.as_json(),
            "migrationId": self.migration_id,
            "planDigest": _require_digest(self.plan_digest),
            "fileDigest": _require_digest(self.file_digest),
            "sourceBundleDigest": _require_digest(self.source_bundle_digest),
            "expectedHead": _require_digest(self.expected_head, nullable=True),
            "phaseDigests": [_require_digest(value) for value in self.phase_digests],
            "qualificationProfile": self.qualification_profile,
            "evidenceDigest": _require_digest(self.evidence_digest),
        }

    @property
    def digest(self) -> str:
        return _digest(self.as_json())


@dataclass(frozen=True, slots=True)
class ApprovalReceipt:
    """Receipt returned from a protected host-owned approval store.

    Values copied from a migration source are never accepted as a receipt.
    The host adapter verifies catalog ownership/ACL before constructing this
    value and obtains decider/time from the authenticated database session.
    """

    receipt_id: str
    binding_digest: str
    decision: str
    decider: str
    decided_at: str
    qualification_profile: str
    evidence_digest: str

    def verify(self, binding: ApprovalBinding) -> None:
        try:
            decided_at = datetime.fromisoformat(self.decided_at)
        except (AttributeError, ValueError):
            decided_at = None
        if (type(self.receipt_id) is not str or not self.receipt_id
                or _require_digest(self.binding_digest) != binding.digest
                or self.decision != "approved"
                or type(self.decider) is not str or not self.decider
                or decided_at is None or decided_at.tzinfo is None
                or type(self.qualification_profile) is not str or not self.qualification_profile
                or self.qualification_profile != binding.qualification_profile
                or _require_digest(self.evidence_digest) != binding.evidence_digest):
            raise CatalogError("approval-receipt-mismatch")


def _create_approval_relation(connection: Any, schema: str,
                              relation: str = APPROVAL_PROFILE["relation"]) -> dict[str, str]:
    definitions = list(_APPROVAL_DEFINITIONS)
    aliases: dict[str, str] = {}
    for name, body in _APPROVAL_CONSTRAINTS:
        actual = name if relation == APPROVAL_PROFILE["relation"] else "umf_verify_" + uuid4().hex
        aliases[actual] = name
        definitions.append("CONSTRAINT " + _q(actual) + " " + body)
    _execute(connection, "CREATE TABLE " + _q(schema) + "." + _q(relation)
             + " (" + ", ".join(definitions) + ") USING heap")
    return aliases


def _verify_approval_relation(connection: Any, source: dict[str, Any], *,
                              create: bool = False) -> bool:
    """Verify exact selected receipt schema, owner-only ACL and catalog shape."""
    schema, owner = source["configuration"]["schema"], source["configuration"]["ownerRole"]
    relation = APPROVAL_PROFILE["relation"]
    state = _one(connection, _APPROVAL_STATE, (schema, relation))
    if state is None:
        if not create:
            return False
        _create_approval_relation(connection, schema)
        state = _one(connection, _APPROVAL_STATE, (schema, relation))
    if tuple(state[:12]) != ("r", "p", owner, False, False, False, False, False,
                            "d", False, False, False):
        raise CatalogError("approval-catalog-mismatch")
    if state[15:] != (False,):
        raise CatalogError("approval-catalog-mismatch")
    owner_id, relation_id = state[12:14]
    heap_id = _one(connection, "SELECT oid FROM pg_catalog.pg_am WHERE amname='heap'")[0]
    if state[14] != heap_id:
        raise CatalogError("approval-catalog-mismatch")
    _execute(connection, "LOCK TABLE " + _q(schema) + "." + _q(relation)
             + " IN ACCESS EXCLUSIVE MODE")
    if _one(connection, _APPROVAL_STATE, (schema, relation)) != state:
        raise CatalogError("approval-catalog-mismatch")
    actual_acl = _all(connection, """SELECT x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
WHERE c.oid=%s ORDER BY 1,2,3,4""", (relation_id,))
    expected_acl = _all(connection, """SELECT grantor,grantee,privilege_type,is_grantable
FROM pg_catalog.aclexplode(pg_catalog.acldefault('r',%s::pg_catalog.oid)) ORDER BY 1,2,3,4""", (owner_id,))
    if (actual_acl != expected_acl
            or _one(connection, """SELECT count(*) FROM pg_catalog.pg_attribute a,
LATERAL pg_catalog.aclexplode(a.attacl) x WHERE a.attrelid=%s""", (relation_id,)) != (0,)):
        raise CatalogError("approval-privilege-mismatch")
    temporary = "umf_verify_" + uuid4().hex
    aliases = _create_approval_relation(connection, schema, temporary)
    if (_columns(connection, schema, relation) != _columns(connection, schema, temporary)
            or _constraint_shapes(connection, schema, relation, {})
            != _constraint_shapes(connection, schema, temporary, aliases)
            or _index_shapes(connection, schema, relation, {})
            != _index_shapes(connection, schema, temporary, aliases)):
        _execute(connection, "DROP TABLE " + _q(schema) + "." + _q(temporary))
        raise CatalogError("approval-catalog-mismatch")
    _execute(connection, "DROP TABLE " + _q(schema) + "." + _q(temporary))
    return True


def _approval_shape(connection: Any, source: dict[str, Any]) -> dict[str, Any]:
    """Return read-only native shape after the trusted scratch-schema proof."""
    from .catalog import _COLUMNS, _CONSTRAINTS, _INDEXES

    schema, relation = source["configuration"]["schema"], APPROVAL_PROFILE["relation"]
    if not _verify_approval_relation(connection, source):
        raise CatalogError("approval-catalog-mismatch")
    state = _one(connection, _APPROVAL_STATE, (schema, relation))
    if state is None:
        raise CatalogError("approval-catalog-mismatch")
    relation_oid = state[13]
    table_acl = _all(connection, """SELECT x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
WHERE c.oid=%s ORDER BY 1,2,3,4""", (relation_oid,))
    column_acl = _all(connection, """SELECT a.attname,x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_attribute a,LATERAL pg_catalog.aclexplode(a.attacl) x
WHERE a.attrelid=%s ORDER BY 1,2,3,4,5""", (relation_oid,))
    return {
        "state": list(state),
        "columns": _all(connection, _COLUMNS, (schema, relation)),
        "constraints": _all(connection, _CONSTRAINTS, (schema, relation)),
        "indexes": _all(connection, _INDEXES, (schema, relation)),
        "tableAcl": table_acl,
        "columnAcl": column_acl,
    }


def _approval_shape_steps(schema: str):
    """Read-only pg_catalog observer for ordinary generated head clients."""
    from .catalog import _COLUMNS, _CONSTRAINTS, _INDEXES
    from .probe import _Query

    relation = APPROVAL_PROFILE["relation"]
    state = yield _Query("one", _APPROVAL_STATE, (schema, relation))
    if state is None:
        raise CatalogError("approval-catalog-mismatch")
    relation_oid = state[13]
    table_acl = yield _Query("all", """SELECT x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
WHERE c.oid=%s ORDER BY 1,2,3,4""", (relation_oid,))
    column_acl = yield _Query("all", """SELECT a.attname,x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_attribute a,LATERAL pg_catalog.aclexplode(a.attacl) x
WHERE a.attrelid=%s ORDER BY 1,2,3,4,5""", (relation_oid,))
    return {
        "state": list(state),
        "columns": (yield _Query("all", _COLUMNS, (schema, relation))),
        "constraints": (yield _Query("all", _CONSTRAINTS, (schema, relation))),
        "indexes": (yield _Query("all", _INDEXES, (schema, relation))),
        "tableAcl": table_acl,
        "columnAcl": column_acl,
    }


def _record_approval(connection: Any, source: dict[str, Any], binding: ApprovalBinding, *,
                     decision: str, qualification_profile: str,
                     evidence_digest: str) -> ApprovalReceipt:
    """Persist an immutable decision under the authenticated owner session."""
    from psycopg.types.json import Jsonb

    if decision not in {"approved", "denied"}:
        raise CatalogError("approval-decision-invalid")
    if (type(qualification_profile) is not str or not qualification_profile
            or _require_digest(evidence_digest) is None
            or qualification_profile != binding.qualification_profile
            or evidence_digest != binding.evidence_digest):
        raise CatalogError("approval-binding-invalid")
    schema = source["configuration"]["schema"]
    relation = _q(schema) + "." + _q(APPROVAL_PROFILE["relation"])
    existing = _approval_row(connection, schema, binding)
    if existing is not None:
        receipt = existing
        if (receipt.decision != decision or receipt.qualification_profile != qualification_profile
                or receipt.evidence_digest != evidence_digest):
            raise CatalogError("approval-receipt-conflict")
        return receipt
    decider = _one(connection, "SELECT session_user")[0]
    if type(decider) is not str or not decider:
        raise CatalogError("approval-decider-unavailable")
    receipt_id = str(uuid4())
    row = _one(connection, """INSERT INTO """ + relation + """
(approval_id,binding_digest,binding,decision,decider,decided_at,qualification_profile,evidence_digest)
VALUES (%s,%s,%s,%s,%s,pg_catalog.clock_timestamp(),%s,%s)
RETURNING approval_id::pg_catalog.text,decided_at""",
                (receipt_id, binding.digest, Jsonb(binding.as_json()), decision,
                 decider, qualification_profile, evidence_digest))
    if row is None or row[0] != receipt_id or row[1] is None:
        raise CatalogError("approval-receipt-write-failed")
    return ApprovalReceipt(receipt_id, binding.digest, decision, decider,
                           row[1].isoformat(), qualification_profile, evidence_digest)


def _approval_row(connection: Any, schema: str,
                  binding: ApprovalBinding) -> ApprovalReceipt | None:
    row = _one(connection, """SELECT approval_id::pg_catalog.text,binding_digest,binding,decision,
decider,decided_at,qualification_profile,evidence_digest
FROM """ + _q(schema) + "." + _q(APPROVAL_PROFILE["relation"])
                  + " WHERE binding_digest=%s", (binding.digest,))
    if row is None:
        return None
    if row[2] != binding.as_json():
        raise CatalogError("approval-receipt-mismatch")
    receipt = ApprovalReceipt(row[0], row[1], row[3], row[4],
                              row[5].isoformat() if row[5] is not None else "",
                              row[6], row[7])
    if receipt.decision == "approved":
        receipt.verify(binding)
    elif (receipt.decision != "denied" or receipt.binding_digest != binding.digest
          or receipt.qualification_profile != binding.qualification_profile
          or receipt.evidence_digest != binding.evidence_digest):
        raise CatalogError("approval-receipt-mismatch")
    return receipt


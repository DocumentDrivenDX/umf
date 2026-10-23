# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed owner-only durable receipts for mixed migration phases."""
from __future__ import annotations

import hashlib
import json
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

PROGRESS = 'umf_lifecycle_progress'
_DEFINITIONS = [
    '"migration_id" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"plan_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"expected_head" pg_catalog.text COLLATE pg_catalog."C"',
    '"file_digest" pg_catalog.text COLLATE pg_catalog."C"',
    '"phase_index" pg_catalog.int8 NOT NULL',
    '"state" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"phase_digest" pg_catalog.text COLLATE pg_catalog."C" NOT NULL',
    '"completed_steps" pg_catalog.jsonb NOT NULL',
    '"prefix_witness" pg_catalog.jsonb',
]
_CONSTRAINTS = [
    ('umf_lifecycle_progress_pkey', 'PRIMARY KEY ("migration_id")'),
    ('progress_positive_phase', 'CHECK ("phase_index">=0)'),
    ('progress_plan_digest', 'CHECK ("plan_digest" ~ \'^[a-f0-9]{64}$\')'),
    ('progress_head_digest', 'CHECK ("expected_head" IS NULL OR "expected_head" ~ \'^[a-f0-9]{64}$\')'),
    ('progress_file_digest', 'CHECK ("file_digest" IS NULL OR "file_digest" ~ \'^[a-f0-9]{64}$\')'),
    ('progress_state', 'CHECK ("state" IN (\'ready\',\'intent\',\'complete\'))'),
    ('progress_phase_digest', 'CHECK ("phase_digest" ~ \'^[a-f0-9]{64}$\')'),
    ('progress_step_array', 'CHECK (pg_catalog.jsonb_typeof("completed_steps")=\'array\')'),
    ('progress_witness_object', 'CHECK ("prefix_witness" IS NULL OR pg_catalog.jsonb_typeof("prefix_witness")=\'object\')'),
]
_STATE = """SELECT c.relkind,c.relpersistence,r.rolname,c.relrowsecurity,c.relforcerowsecurity,
c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident,
EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
EXISTS(SELECT FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid),
EXISTS(SELECT FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),r.oid,c.oid,c.relam
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname=%s AND c.relname=%s"""


def _canonical_bytes(value: Any) -> bytes:
    """Bounded JSON subset used for phase receipt hashes."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def _phase_digest(phase: dict[str, Any], steps: list[dict[str, Any]]) -> str:
    return hashlib.sha256(_canonical_bytes({'phase': phase, 'steps': steps})).hexdigest()


def _verified_phases(plan: dict[str, Any]) -> list[dict[str, Any]]:
    """Check exact ordered step coverage before consulting or creating progress."""
    profile = plan.get('executionProfile')
    phases = plan.get('phases')
    options_version = plan.get('options', {}).get('version')
    if options_version == 'umf.table-migration-options/0.2':
        expected_profile = {'version': 'umf.table-migration-execution/0.1',
                            'progressRelation': PROGRESS, 'ownerOnly': True}
        allow_backfill_tighten = False
    elif options_version == 'umf.table-migration-options/0.3':
        from .approval import APPROVAL_PROFILE

        expected_profile = {'version': 'umf.table-migration-execution/0.2',
                            'progressRelation': PROGRESS, 'ownerOnly': True}
        if plan.get('approvalProfile') != APPROVAL_PROFILE:
            raise CatalogError('approval-profile-mismatch')
        allow_backfill_tighten = True
    elif options_version == 'umf.table-migration-options/0.4':
        from .approval import APPROVAL_PROFILE

        expected_profile = {'version': 'umf.table-migration-execution/0.3',
                            'progressRelation': PROGRESS, 'ownerOnly': True}
        if (plan.get('version') != 'umf.table-migration/0.4'
                or plan.get('approvalProfile') != APPROVAL_PROFILE):
            raise CatalogError('approval-profile-mismatch')
        allow_backfill_tighten = True
    else:
        raise CatalogError('mixed-phase-profile')
    if (profile != expected_profile
            or type(phases) is not list or type(plan.get('steps')) is not list):
        raise CatalogError('mixed-phase-profile')
    if not phases:
        # A v0.3 source-only plan can have no native operations (for example,
        # an added typed command). It publishes through the host's atomic
        # no-effect finalizer and must not create a progress relation.
        if options_version in ('umf.table-migration-options/0.3','umf.table-migration-options/0.4') and not plan['steps']:
            return phases
        raise CatalogError('mixed-phase-profile')
    by_id = {step.get('id'): step for step in plan['steps'] if type(step) is dict}
    if len(by_id) != len(plan['steps']):
        raise CatalogError('mixed-phase-profile')
    seen: list[str] = []
    for index, phase in enumerate(phases, 1):
        if (type(phase) is not dict or set(phase) != {'id','kind','transaction','steps'}
                or phase['id'] != 'phase-'+str(index).zfill(5)
                or phase['kind'] not in ('transaction','backfill','concurrent-index','constraint-add','constraint-validation','seed','backfill-tighten','backfill-add')
                or phase['transaction'] not in ('required','forbidden')
                or type(phase['steps']) is not list or not phase['steps']):
            raise CatalogError('mixed-phase-profile')
        selected = []
        for step_id in phase['steps']:
            step = by_id.get(step_id)
            if step is None or step['transaction'] != phase['transaction']:
                raise CatalogError('mixed-phase-profile')
            selected.append(step)
            seen.append(step_id)
        expected_kind = []
        append_group = any(step.get('phaseOperation') == 'add-column' for step in selected)
        for step in selected:
            if append_group and step.get('phaseOperation') in ('add-column','target-check','backfill','install-default','tighten-not-null'):
                expected_kind.append('backfill-add')
            elif step.get('phaseOperation') in ('backfill','tighten-not-null'):
                expected_kind.append('backfill-tighten')
            elif step.get('phaseOperation') in ('add-column','target-check','install-default'):
                expected_kind.append('backfill-add')
            elif step['kind'] == 'backfill':
                expected_kind.append('backfill')
            elif step['kind'] == 'index' and step['transaction'] == 'forbidden':
                expected_kind.append('concurrent-index')
            elif step.get('operation') == 'add-not-valid':
                expected_kind.append('constraint-add')
            elif step.get('operation') == 'validate':
                expected_kind.append('constraint-validation')
            elif step.get('kind') == 'seed':
                expected_kind.append('seed')
            else:
                expected_kind.append('transaction')
        if ((len(set(expected_kind)) != 1 or expected_kind[0] != phase['kind']
                or phase['kind'] not in ('transaction','backfill-add') and len(selected) != 1)
                and (phase['kind'] not in ('backfill-tighten','backfill-add') or not allow_backfill_tighten)):
            raise CatalogError('mixed-phase-profile')
        if phase['kind'] == 'backfill-tighten':
            if not allow_backfill_tighten or len(selected) != 2:
                raise CatalogError('mixed-phase-profile')
            backfill, tighten = selected
            target = backfill.get('phaseTarget')
            if (phase['transaction'] != 'required'
                    or backfill.get('phaseOperation') != 'backfill'
                    or backfill.get('kind') != 'backfill'
                    or backfill.get('transaction') != 'required'
                    or type(backfill.get('operation')) is not str
                    or not backfill['operation']
                    or tighten.get('phaseOperation') != 'tighten-not-null'
                    or tighten.get('transaction') != 'required'
                    or type(tighten.get('sql')) is not str
                    or not tighten['sql']
                    or type(target) is not dict
                    or set(target) != {'table','field'}
                    or type(target.get('table')) is not str
                    or not target['table']
                    or type(target.get('field')) is not dict
                    or set(target['field']) != {'module','element'}
                    or any(type(target['field'][key]) is not str or not target['field'][key]
                           for key in ('module','element'))
                    or tighten.get('phaseTarget') != target):
                raise CatalogError('mixed-phase-profile')
        if phase['kind'] == 'backfill-add':
            roles = [step.get('phaseOperation') for step in selected]
            backfill_index = roles.index('backfill') if 'backfill' in roles else -1
            default_index = roles.index('install-default') if 'install-default' in roles else -1
            targets = [step.get('phaseTarget') for step in selected]
            if (options_version != 'umf.table-migration-options/0.4'
                    or len(selected) < 3 or roles[0] != 'add-column'
                    or roles[-1] != 'tighten-not-null'
                    or roles.count('backfill') != 1 or roles.count('tighten-not-null') != 1
                    or roles.count('install-default') > 1 or backfill_index < 1
                    or any(role != 'target-check' for role in roles[1:backfill_index])
                    or default_index != -1 and default_index < backfill_index
                    or any(role != 'install-default' for role in roles[backfill_index+1:-1])
                    or any(step['transaction'] != 'required' for step in selected)
                    or any(target != targets[0] for target in targets)
                    or selected[0].get('kind') != 'table'
                    or selected[backfill_index].get('kind') != 'backfill'
                    or selected[backfill_index].get('sql') != ''
                    or selected[-1].get('kind') != 'table'):
                raise CatalogError('mixed-phase-profile')
        if phase['kind'] == 'backfill' and (len(selected) != 1 or selected[0]['kind'] != 'backfill'):
            raise CatalogError('mixed-phase-profile')
        if phase['kind'] == 'concurrent-index' and (len(selected) != 1 or selected[0]['kind'] != 'index' or selected[0]['transaction'] != 'forbidden'):
            raise CatalogError('mixed-phase-profile')
        if phase['kind'] == 'constraint-add' and (len(selected) != 1 or selected[0].get('operation') != 'add-not-valid'):
            raise CatalogError('mixed-phase-profile')
        if phase['kind'] == 'constraint-validation' and (len(selected) != 1 or selected[0].get('operation') != 'validate'):
            raise CatalogError('mixed-phase-profile')
        if phase['kind'] == 'seed' and (len(selected) != 1 or selected[0].get('kind') != 'seed'):
            raise CatalogError('mixed-phase-profile')
    if seen != [step['id'] for step in plan['steps']]:
        raise CatalogError('mixed-phase-profile')
    return phases


def _create_progress(connection: Any, schema: str, name: str = PROGRESS) -> dict[str, str]:
    definitions = list(_DEFINITIONS)
    aliases: dict[str, str] = {}
    for constraint, body in _CONSTRAINTS:
        actual = constraint if name == PROGRESS else 'umf_verify_'+uuid4().hex
        aliases[actual] = constraint
        definitions.append('CONSTRAINT '+_q(actual)+' '+body)
    _execute(connection, 'CREATE TABLE '+_q(schema)+'.'+_q(name)+' ('+', '.join(definitions)+') USING heap')
    return aliases


def _verify_progress_schema(connection: Any, source: dict[str, Any], *, create: bool = False) -> bool:
    """Exact schema, owner, heap, constraints, indexes and default ACL check."""
    schema, owner = source['configuration']['schema'], source['configuration']['ownerRole']
    state = _one(connection, _STATE, (schema, PROGRESS))
    if state is None:
        if not create:
            return False
        _create_progress(connection, schema)
        state = _one(connection, _STATE, (schema, PROGRESS))
    if tuple(state[:12]) != ('r','p',owner,False,False,False,False,False,'d',False,False,False):
        # Relhasrules and relreplident are checked separately below; keep the
        # expected tuple explicit to reject views, partitions, RLS and triggers.
        raise CatalogError('progress-catalog-mismatch')
    owner_id, relation_id = state[12:14]
    if state[14] != _one(connection, "SELECT oid FROM pg_catalog.pg_am WHERE amname='heap'")[0]:
        raise CatalogError('progress-catalog-mismatch')
    _execute(connection, 'LOCK TABLE '+_q(schema)+'.'+_q(PROGRESS)+' IN ACCESS EXCLUSIVE MODE')
    if _one(connection, _STATE, (schema, PROGRESS)) != state:
        raise CatalogError('progress-catalog-mismatch')
    actual_acl = _all(connection, """SELECT x.grantor,x.grantee,x.privilege_type,x.is_grantable
FROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
WHERE c.oid=%s ORDER BY 1,2,3,4""", (relation_id,))
    expected_acl = _all(connection, """SELECT grantor,grantee,privilege_type,is_grantable
FROM pg_catalog.aclexplode(pg_catalog.acldefault('r',%s::pg_catalog.oid)) ORDER BY 1,2,3,4""", (owner_id,))
    if actual_acl != expected_acl or _one(connection, """SELECT count(*) FROM pg_catalog.pg_attribute a,
LATERAL pg_catalog.aclexplode(a.attacl) x WHERE a.attrelid=%s""", (relation_id,)) != (0,):
        raise CatalogError('progress-privilege-mismatch')
    temporary = 'umf_verify_'+uuid4().hex
    aliases = _create_progress(connection, schema, temporary)
    if (_columns(connection, schema, PROGRESS) != _columns(connection, schema, temporary)
            or _constraint_shapes(connection, schema, PROGRESS, {}) != _constraint_shapes(connection, schema, temporary, aliases)
            or _index_shapes(connection, schema, PROGRESS, {}) != _index_shapes(connection, schema, temporary, aliases)):
        _execute(connection, 'DROP TABLE '+_q(schema)+'.'+_q(temporary))
        raise CatalogError('progress-catalog-mismatch')
    _execute(connection, 'DROP TABLE '+_q(schema)+'.'+_q(temporary))
    return True


def _progress_rows(connection: Any, schema: str) -> list[dict[str, Any]]:
    rows = _all(connection, 'SELECT migration_id,plan_digest,expected_head,file_digest,phase_index,state,phase_digest,completed_steps,prefix_witness FROM '+_q(schema)+'.'+_q(PROGRESS)+' ORDER BY migration_id', ())
    if len(rows) > 1:
        raise CatalogError('progress-capacity')
    result = []
    for row in rows:
        migration_id, plan_digest, expected_head, file_digest, phase_index, state, phase_digest, steps, witness = row
        if type(steps) is not list or witness is not None and type(witness) is not dict:
            raise CatalogError('progress-state-mismatch')
        result.append({'migrationId': migration_id, 'planDigest': plan_digest,
                       'expectedHead': expected_head, 'fileDigest': file_digest,
                       'phaseIndex': phase_index, 'state': state,
                       'phaseDigest': phase_digest, 'completedSteps': steps,
                       'prefixWitness': witness})
    return result


def _write_progress(connection: Any, schema: str, receipt: dict[str, Any]) -> None:
    """Upsert is only called inside the same transaction as its required phase."""
    payload = json.dumps(receipt['completedSteps'], separators=(',', ':'))
    witness = None if receipt['prefixWitness'] is None else json.dumps(receipt['prefixWitness'], separators=(',', ':'))
    _execute(connection, 'INSERT INTO '+_q(schema)+'.'+_q(PROGRESS)+' (migration_id,plan_digest,expected_head,file_digest,phase_index,state,phase_digest,completed_steps,prefix_witness) VALUES (%s,%s,%s,%s,%s,%s,%s,%s::pg_catalog.jsonb,%s::pg_catalog.jsonb) ON CONFLICT (migration_id) DO UPDATE SET phase_index=EXCLUDED.phase_index,state=EXCLUDED.state,phase_digest=EXCLUDED.phase_digest,completed_steps=EXCLUDED.completed_steps,prefix_witness=EXCLUDED.prefix_witness',
             (receipt['migrationId'], receipt['planDigest'], receipt['expectedHead'], receipt['fileDigest'], receipt['phaseIndex'], receipt['state'], receipt['phaseDigest'], payload, witness))


def _assert_progress_binding(receipt: dict[str, Any], *, migration_id: str, plan_digest: str,
                             expected_head: str | None, file_digest: str | None) -> None:
    if (receipt['migrationId'] != migration_id or receipt['planDigest'] != plan_digest
            or receipt['expectedHead'] != expected_head or receipt['fileDigest'] != file_digest):
        raise CatalogError('progress-binding-mismatch')


def _delete_progress(connection: Any, schema: str, migration_id: str) -> None:
    _execute(connection, 'DELETE FROM '+_q(schema)+'.'+_q(PROGRESS)+' WHERE migration_id=%s', (migration_id,))


def _drop_progress(connection: Any, schema: str) -> None:
    _execute(connection, 'DROP TABLE '+_q(schema)+'.'+_q(PROGRESS))

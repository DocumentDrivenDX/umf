# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit administrative new/check/apply entrypoint; offline commands do no I/O to DB."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from .catalog import CatalogError, _execute, _q
from .concurrent import apply_concurrent_indexes
from .host import MigrationRequest, PsycopgMigrationHost, apply_migration_on_host
from .ledger import apply_table_migration
from .mixed import apply_mixed_migration


def _load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def check_chain(paths, *, current_bundle=None, manifest=None):
    """Verify original file bytes when pinned, complete source and terminal snapshot."""
    from umf_codegen import verify_table_deployment, verify_table_migration

    previous = None
    identities = set()
    files = []
    for path in paths:
        raw = Path(path).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if manifest is not None and manifest.get(Path(path).name) != digest:
            raise CatalogError('migration-file-digest-conflict')
        plan = verify_table_migration(json.loads(raw))
        if (plan['id'] in identities or plan['predecessor'] !=
                ({'id':previous['id'],'digest':previous['digest']} if previous else None)
                or plan['fromBundleDigest'] != (previous['toBundleDigest'] if previous else None)):
            raise CatalogError('migration-chain-mismatch')
        identities.add(plan['id'])
        files.append({'file':Path(path).name,'sha256':digest,'planDigest':plan['digest']})
        previous = plan
    if not previous:
        raise CatalogError('migration-chain-empty')
    if current_bundle is not None and verify_table_deployment(current_bundle)['bundleDigest'] != previous['toBundleDigest']:
        raise CatalogError('migration-terminal-source-mismatch')
    return {'status':'checked','files':files,'toBundleDigest':previous['toBundleDigest']}


def main(argv=None):
    parser = argparse.ArgumentParser(prog='umf-table',allow_abbrev=False)
    commands = parser.add_subparsers(dest='command',required=True)
    new = commands.add_parser('new',allow_abbrev=False)
    new.add_argument('--request',required=True,type=Path)
    new.add_argument('--output',required=True,type=Path)
    check = commands.add_parser('check',allow_abbrev=False)
    check.add_argument('--plan',required=True,action='append',type=Path)
    check.add_argument('--current-bundle',type=Path)
    check.add_argument('--manifest',type=Path)
    apply = commands.add_parser('apply',allow_abbrev=False)
    apply.add_argument('--plan',required=True,type=Path)
    apply.add_argument('--dsn',default='')
    apply.add_argument('--approved-digest',help='Legacy plan-digest gate; does not create host approval')
    apply.add_argument('--expected-head',help='Prior entryDigest, or initial for an empty installation')
    apply.add_argument('--person-role',action='append',default=[])
    apply.add_argument('--repair-invalid',action='store_true')
    _add_host_arguments(apply, include_receipt=True)
    approve = commands.add_parser('approve',aliases=['record-approval'],allow_abbrev=False)
    approve.add_argument('--plan',required=True,type=Path)
    approve.add_argument('--dsn',default='')
    approve.add_argument('--expected-head',required=True,help='Prior entryDigest for the installed predecessor')
    approve.add_argument('--decision',choices=('approved','denied'),default='approved')
    approve.add_argument('--person-role',action='append',default=[])
    _add_host_arguments(approve)
    args = parser.parse_args(argv)
    try:
        if args.command == 'new':
            from umf_codegen import compile_table_migration

            request = _load(args.request)
            if set(request)-{'id','predecessor','previous','next','options'} or not {'id','predecessor','previous','next'} <= set(request):
                raise CatalogError('migration-request-shape')
            result = compile_table_migration(migration_id=request['id'],predecessor=request['predecessor'],
                previous_bundle=request['previous'],next_bundle=request['next'],options=request.get('options'))
            if result['status'] != 'compiled':
                print(json.dumps(result),file=sys.stderr)
                return 1
            with args.output.open('x',encoding='utf-8') as output:
                output.write(json.dumps(result['plan'],ensure_ascii=False,indent=2)+'\n')
            response = {'status':'created','digest':result['plan']['digest']}
        elif args.command == 'check':
            response = check_chain(args.plan,current_bundle=_load(args.current_bundle) if args.current_bundle else None,
                                   manifest=_load(args.manifest) if args.manifest else None)
        elif args.command == 'approve' or args.command == 'record-approval':
            from psycopg import connect
            from umf_codegen import verify_table_migration

            raw = args.plan.read_bytes()
            plan = verify_table_migration(json.loads(raw))
            _require_host_profile(plan)
            _require_host_arguments(args)
            head = _required_head(args.expected_head)
            file_digest = hashlib.sha256(raw).hexdigest()
            with connect(args.dsn,autocommit=True) as connection:
                _set_owner(connection,plan)
                host = PsycopgMigrationHost(connection,
                    person_roles=tuple(args.person_role),target_profile=args.target_profile,
                    installation_id=args.installation_id)
                request = MigrationRequest(plan,head,file_digest)
                receipt = host.record_approval(request,decision=args.decision,
                    qualification_profile=args.qualification_profile,
                    evidence_digest=args.evidence_digest)
                response = {'status':'recorded','receiptId':receipt.receipt_id,
                    'decision':receipt.decision,'bindingDigest':receipt.binding_digest,
                    'installationId':args.installation_id,
                    'decider':receipt.decider,
                    'decidedAt':receipt.decided_at,
                    'qualificationProfile':receipt.qualification_profile,
                    'evidenceDigest':receipt.evidence_digest}
        else:
            from psycopg import connect
            from umf_codegen import verify_table_migration

            raw = args.plan.read_bytes()
            plan = verify_table_migration(json.loads(raw))
            if plan.get('version') in ('umf.table-migration/0.3','umf.table-migration/0.4','umf.table-migration/0.5'):
                _require_host_arguments(args)
                head = _required_head(args.expected_head)
            else:
                if args.expected_head is None:
                    raise CatalogError('migration-head-required')
                head = None if args.expected_head == 'initial' else args.expected_head
            file_digest = hashlib.sha256(raw).hexdigest()
            if plan.get('version') in ('umf.table-migration/0.3','umf.table-migration/0.4','umf.table-migration/0.5'):
                _require_host_profile(plan)
                if args.repair_invalid:
                    raise CatalogError('repair-profile-unsupported')
                if args.approved_digest is not None and args.approved_digest != plan['digest']:
                    raise CatalogError('migration-digest-mismatch')
                if args.approval_id is None:
                    raise CatalogError('approval-receipt-required')
                with connect(args.dsn,autocommit=True) as connection:
                    _set_owner(connection,plan)
                    host = PsycopgMigrationHost(connection,
                        person_roles=tuple(args.person_role),target_profile=args.target_profile,
                        installation_id=args.installation_id)
                    response = apply_migration_on_host(host,plan,expected_head=head,
                        file_digest=file_digest,qualification_profile=args.qualification_profile,
                        evidence_digest=args.evidence_digest,approval_id=args.approval_id)
            else:
                if args.approved_digest is None or args.approved_digest != plan['digest']:
                    raise CatalogError('approval-required')
                with connect(args.dsn,autocommit=True) as connection:
                    owner = plan['next']['configuration']['ownerRole']
                    if plan.get('executionProfile') is not None:
                        _execute(connection,'SET ROLE '+_q(owner))
                        _execute(connection,'SET search_path=pg_catalog')
                        response = apply_mixed_migration(connection,plan,approved_digest=args.approved_digest,
                            expected_head=head,person_roles=tuple(args.person_role),file_digest=file_digest,
                            repair_invalid=args.repair_invalid)
                    elif any(s['transaction']=='forbidden' for s in plan['steps']):
                        _execute(connection,'SET ROLE '+_q(owner))
                        _execute(connection,'SET search_path=pg_catalog')
                        response = apply_concurrent_indexes(connection,plan,approved_digest=args.approved_digest,
                            expected_head=head,person_roles=tuple(args.person_role),repair_invalid=args.repair_invalid,file_digest=file_digest)
                    else:
                        if args.repair_invalid:
                            raise CatalogError('index-phase-profile')
                        with connection.transaction():
                            _execute(connection,'SET LOCAL ROLE '+_q(owner))
                            _execute(connection,'SET LOCAL search_path=pg_catalog')
                            response = apply_table_migration(connection,plan,approved_digest=args.approved_digest,
                                expected_head=head,person_roles=tuple(args.person_role),file_digest=file_digest)
                        response = {**response,'status':'committed','commitResponsibility':'runner'}
        print(json.dumps(response))
        return 0
    except Exception as error:  # noqa: BLE001 -- fixed sanitized process boundary, never DSN/native data
        code = str(error) if isinstance(error,CatalogError) else getattr(error,'code','LIFECYCLE_FAILED')
        payload = {'status':'blocked','code':code}
        if isinstance(error,CatalogError) and error.sqlstate is not None:
            payload['sqlstate'] = error.sqlstate
        print(json.dumps(payload),file=sys.stderr)
        return 1


def _add_host_arguments(command, *, include_receipt=False):
    command.add_argument('--installation-id',help='Stable trusted host identifier for this database installation')
    command.add_argument('--target-profile',help='Host-selected target profile, e.g. local-postgresql18')
    command.add_argument('--qualification-profile',help='Host qualification profile bound into the receipt')
    command.add_argument('--evidence-digest',help='SHA-256 digest of the host qualification evidence')
    if include_receipt:
        command.add_argument('--approval-id',help='Exact host-issued approval receipt identifier')


def _require_host_profile(plan):
    expected_options = {
        'umf.table-migration/0.3': 'umf.table-migration-options/0.3',
        'umf.table-migration/0.4': 'umf.table-migration-options/0.4',
        'umf.table-migration/0.5': 'umf.table-migration-options/0.5',
    }
    if (plan.get('version') not in expected_options
            or plan.get('options', {}).get('version') != expected_options.get(plan.get('version'))
            or plan.get('approvalProfile') != {
                'version':'umf.table-migration-approval/0.1',
                'relation':'umf_lifecycle_approvals','ownerOnly':True}):
        raise CatalogError('host-migration-profile')


def _require_host_arguments(args):
    values = (args.installation_id,args.target_profile,args.qualification_profile)
    if any(type(value) is not str or not value.strip() for value in values):
        raise CatalogError('host-configuration-required')
    if (type(args.evidence_digest) is not str
            or len(args.evidence_digest) != 64
            or any(char not in '0123456789abcdef' for char in args.evidence_digest)):
        raise CatalogError('host-evidence-digest-invalid')


def _required_head(value):
    if value is None or value == 'initial':
        raise CatalogError('migration-head-required')
    return value


def _set_owner(connection, plan):
    owner = plan['next']['configuration']['ownerRole']
    _execute(connection,'SET ROLE '+_q(owner))
    _execute(connection,'SET search_path=pg_catalog')


if __name__ == '__main__':
    sys.exit(main())

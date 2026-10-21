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
    apply.add_argument('--approved-digest',required=True)
    apply.add_argument('--expected-head',required=True,help='Prior entryDigest, or initial for an empty installation')
    apply.add_argument('--person-role',action='append',default=[])
    apply.add_argument('--repair-invalid',action='store_true')
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
        else:
            from psycopg import connect
            from umf_codegen import verify_table_migration

            raw = args.plan.read_bytes()
            plan = verify_table_migration(json.loads(raw))
            if args.approved_digest != plan['digest']:
                raise CatalogError('approval-required')
            head = None if args.expected_head == 'initial' else args.expected_head
            file_digest = hashlib.sha256(raw).hexdigest()
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
        print(json.dumps({'status':'blocked','code':code}),file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

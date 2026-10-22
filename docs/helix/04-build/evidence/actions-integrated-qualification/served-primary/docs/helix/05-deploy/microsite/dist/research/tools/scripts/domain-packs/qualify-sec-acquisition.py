"""Qualify a released SEC pack without editing its frozen corpus.

Run with the released TableSpec 0.0.9 and umf-core 0.8.1 on PYTHONPATH.
--preflight needs no contact or network. The full run needs the genuine
UMF_LOADER_USER_AGENT, and retains originals and receipts in a new directory.
"""

import argparse
import hashlib
import importlib.metadata as metadata
import json
import os
import platform
import socket
from datetime import datetime, timezone
from pathlib import Path

from tablespec.document_loader import (
    DuckDBMetadataSink, LocalObjects, export_bag, fetch_sources, fixity_audit,
    load_publication, publish_sources, validate_bag,
)
from tablespec.document_loader.core import parse_inventory, read_pack


def stamp():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', type=Path, required=True)
    parser.add_argument('--inventory', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--preflight', action='store_true')
    args = parser.parse_args()
    versions = {n: metadata.version(n) for n in ('tablespec', 'umf-core', 'jsonschema', 'duckdb')}
    if versions['tablespec'] != '0.0.9' or versions['umf-core'] != '0.8.1':
        raise ValueError('Requires released tablespec 0.0.9 and umf-core 0.8.1')
    pack, pack_hash = read_pack(args.pack)
    inventory = parse_inventory(args.inventory.read_bytes(), 'sec-filings', 'redistribute')
    if pack['loader']['profile'] != 'sec-filings':
        raise ValueError('SEC profile required')
    result = {'started_at': stamp(), 'python': platform.python_version(),
              'versions': versions, 'pack_hash': pack_hash,
              'inventory_hash': hashlib.sha256(args.inventory.read_bytes()).hexdigest(),
              'selected_sources': len(inventory['entries']), 'checks': {},
              'scope': 'Local live SEC originals, refresh, BagIt and offline DuckDB; no Databricks claim'}
    if args.preflight:
        result['status'] = 'preflight_complete'
        print(json.dumps(result))
        return
    if not os.environ.get('UMF_LOADER_USER_AGENT'):
        raise ValueError('Genuine SEC organization/contact User-Agent required')
    args.output.mkdir(parents=True, exist_ok=False)
    state = args.output / 'state'
    try:
        for mode in ('backfill', 'refresh'):
            receipt = fetch_sources(args.pack, args.inventory, state, mode=mode, rights='redistribute')
            result['checks'][mode] = receipt
            if receipt['status'] != 'complete':
                raise ValueError('Incomplete acquisition; inspect retained receipt')
            publication = load_publication(state)
            revisions = {r['id']: r['revision'] for r in publication['manifest']['rows']}
            if mode == 'backfill':
                first = revisions
            else:
                result['checks']['unchanged_refresh'] = first == revisions
                result['checks']['changed_source_ids'] = [i for i in first if first[i] != revisions[i]]
        # Explicitly block outbound TCP during replay, BagIt and publication.
        original_connect, original_connect_ex = socket.socket.connect, socket.socket.connect_ex
        def refuse_network(*_args, **_kwargs):
            raise RuntimeError('Offline stage attempted network access')
        socket.socket.connect = socket.socket.connect_ex = refuse_network
        try:
            replay = fetch_sources(args.pack, None, state, mode='replay', rights='redistribute')
            if replay['status'] != 'complete':
                raise ValueError('Replay failed')
            result['checks']['offline_replay'] = replay
            result['checks']['bagit'] = export_bag(state, args.output / 'handoff')
            checked = validate_bag(args.output / 'handoff')
            result['checks']['fixity'] = fixity_audit(checked)
            import duckdb
            with duckdb.connect(str(args.output / 'publication.duckdb')) as connection:
                sink = DuckDBMetadataSink(connection, 'main.sec_documents')
                objects = LocalObjects(args.output / 'published-originals')
                result['checks']['offline_publication'] = publish_sources(checked, sink, objects, mode='merge')
                publish_sources(checked, sink, objects, mode='merge')
                count = connection.execute('SELECT count(*) FROM main.sec_documents').fetchone()[0]
                if count != len(inventory['entries']):
                    raise ValueError('Idempotent merge row count mismatch')
                result['checks']['idempotent_rows'] = count
            result['checks']['offline_tcp_blocked'] = True
        finally:
            socket.socket.connect, socket.socket.connect_ex = original_connect, original_connect_ex
        result['status'] = 'complete' if result['checks']['unchanged_refresh'] else 'refresh_changed'
    except Exception as error:
        result['status'] = 'failed'
        result['error_type'] = type(error).__name__
        raise
    finally:
        result['finished_at'] = stamp()
        (args.output / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps({'status': result['status'], 'evidence': str(args.output / 'result.json')}))


if __name__ == '__main__':
    main()

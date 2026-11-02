#!/usr/bin/env python3
"""Verify the microsite catalog's pack/schema closure against authored pack files.

The check reads JSON files only. It does not build the catalog, export pack
assets, load Bun/native runtimes, or modify source files. When run from
scripts/pack-tools/check_catalog.py, the repository root is inferred from this
file's location; otherwise pass --root explicitly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

PROFILE = 'umf.pack-tools.catalog-closure-check/1'
SOURCE_ROOTS = (
    'domain-packs',
    'packs',
    'spec/domain-packs',
    'examples/domain-packs',
    'docs/helix/05-deploy/microsite/catalog-sources',
)
CATALOG_RELATIVE = Path('docs/helix/05-deploy/microsite/dist/schema-catalog.json')


def raw(path: Path) -> bytes:
    return path.read_bytes()


def text(path: Path) -> str:
    return raw(path).decode('utf-8')


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def inferred_root() -> Path:
    path = Path(__file__).resolve()
    if path.parent.name == 'pack-tools' and path.parent.parent.name == 'scripts':
        return path.parents[2]
    return Path.cwd().resolve()


def run(root: Path, catalog_path: Path) -> dict[str, Any]:
    root = root.resolve()
    catalog_path = catalog_path.resolve()
    catalog_bytes = raw(catalog_path)
    catalog = json.loads(catalog_bytes.decode('utf-8'))
    entries = catalog.get('entries')
    if not isinstance(entries, list):
        raise ValueError('Catalog must contain an entries array')

    by_id: dict[str, dict[str, Any]] = {}
    duplicate_catalog_ids: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get('id'), str):
            continue
        if entry['id'] in by_id:
            duplicate_catalog_ids.append(entry['id'])
        by_id[entry['id']] = entry

    packs = [entry for entry in entries if isinstance(entry, dict) and str(entry.get('id', '')).startswith('pack:')]
    candidates: dict[tuple[str, str], list[tuple[int, Path, dict[str, Any]]]] = {}
    for precedence, relative_root in enumerate(SOURCE_ROOTS):
        source_root = root / relative_root
        if not source_root.exists():
            continue
        for path in sorted(source_root.rglob('*.json')):
            try:
                document = json.loads(text(path))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not (isinstance(document, dict) and isinstance(document.get('id'), str)
                    and isinstance(document.get('version'), str) and 'domain_types' in document):
                continue
            identity = (document['id'], document['version'])
            candidates.setdefault(identity, []).append((precedence, path, document))

    mismatches: list[dict[str, str]] = []
    per_pack: list[dict[str, Any]] = []
    closure_hash_rows: list[tuple[str, str, str]] = []
    matched_schema_count = 0
    source_manifest_count = 0

    def issue(pack_id: str, code: str, detail: str) -> None:
        mismatches.append({'pack': pack_id, 'code': code, 'detail': detail})

    for pack_entry in packs:
        catalog_pack_id = str(pack_entry['id'])
        try:
            catalog_manifest = json.loads(pack_entry.get('text', ''))
        except (TypeError, json.JSONDecodeError) as error:
            issue(catalog_pack_id, 'invalid_catalog_manifest', str(error))
            continue
        if not isinstance(catalog_manifest, dict):
            issue(catalog_pack_id, 'invalid_catalog_manifest', 'Pack text must decode to an object')
            continue
        pack_id, version = catalog_manifest.get('id'), catalog_manifest.get('version')
        if not (isinstance(pack_id, str) and isinstance(version, str)):
            issue(catalog_pack_id, 'invalid_pack_identity', 'Manifest id and version must be strings')
            continue
        identity = (pack_id, version)
        expected_entry_id = f'pack:{pack_id}@{version}'
        if catalog_pack_id != expected_entry_id:
            issue(catalog_pack_id, 'pack_entry_identity_mismatch', f'Expected {expected_entry_id}')

        found = candidates.get(identity, [])
        canonical = [candidate for candidate in found if candidate[0] < len(SOURCE_ROOTS) - 1]
        if len(canonical) > 1:
            issue(catalog_pack_id, 'duplicate_canonical_manifest_candidates', ', '.join(str(candidate[1]) for candidate in canonical))
        selected_candidates = canonical or found
        if not selected_candidates:
            issue(catalog_pack_id, 'canonical_manifest_missing', f'{pack_id}@{version}')
            continue
        chosen_precedence = min(candidate[0] for candidate in selected_candidates)
        chosen = [candidate for candidate in selected_candidates if candidate[0] == chosen_precedence]
        if len(chosen) != 1:
            issue(catalog_pack_id, 'duplicate_manifest_candidates', ', '.join(str(candidate[1]) for candidate in chosen))
            continue
        precedence, manifest_path, authored_manifest = chosen[0]
        source_manifest_count += 1
        manifest_text = text(manifest_path)
        if pack_entry.get('text') != manifest_text:
            issue(catalog_pack_id, 'manifest_text_mismatch', str(manifest_path.relative_to(root)))
        if pack_entry.get('format') != 'json':
            issue(catalog_pack_id, 'manifest_format_mismatch', f"catalog format is {pack_entry.get('format')!r}")
        if (pack_entry.get('pack'), pack_entry.get('packVersion')) != identity:
            issue(catalog_pack_id, 'manifest_owner_mismatch', f"catalog owner is {(pack_entry.get('pack'), pack_entry.get('packVersion'))!r}")

        declarations = authored_manifest.get('schemas', [])
        if not isinstance(declarations, list):
            issue(catalog_pack_id, 'invalid_schema_declarations', 'Manifest schemas must be an array')
            declarations = []
        expected_schema_ids: set[str] = set()
        seen_declaration_ids: set[str] = set()
        seen_references: set[str] = set()
        matched_for_pack = 0
        for declaration in declarations:
            if not isinstance(declaration, dict):
                issue(catalog_pack_id, 'invalid_schema_declaration', repr(declaration))
                continue
            schema_id, reference, schema_format = (declaration.get('id'), declaration.get('reference'), declaration.get('format'))
            if not (isinstance(schema_id, str) and isinstance(reference, str) and isinstance(schema_format, str)):
                issue(catalog_pack_id, 'incomplete_schema_declaration', repr(declaration))
                continue
            if schema_id in seen_declaration_ids or reference in seen_references:
                issue(catalog_pack_id, 'duplicate_schema_declaration', f'{schema_id}: {reference}')
            seen_declaration_ids.add(schema_id)
            seen_references.add(reference)
            schema_entry_id = f'schema:{pack_id}@{version}:{schema_id}'
            expected_schema_ids.add(schema_entry_id)
            schema_entry = by_id.get(schema_entry_id)
            if schema_entry is None:
                issue(catalog_pack_id, 'catalog_schema_missing', schema_entry_id)
                continue
            if schema_entry.get('path') != reference:
                issue(catalog_pack_id, 'schema_reference_path_mismatch', f'{schema_entry_id}: {schema_entry.get("path")!r} != {reference!r}')
            if (schema_entry.get('pack'), schema_entry.get('packVersion')) != identity:
                issue(catalog_pack_id, 'schema_owner_mismatch', schema_entry_id)
            if schema_entry.get('schemaFormat') != schema_format:
                issue(catalog_pack_id, 'schema_format_mismatch', f'{schema_entry_id}: {schema_entry.get("schemaFormat")!r} != {schema_format!r}')

            authored_path = (manifest_path.parent / reference).resolve()
            try:
                authored_path.relative_to(manifest_path.parent.resolve())
            except ValueError:
                issue(catalog_pack_id, 'schema_reference_escapes_pack', f'{reference} -> {authored_path}')
                continue
            try:
                authored_bytes = raw(authored_path)
                authored_text = authored_bytes.decode('utf-8')
            except (OSError, UnicodeDecodeError) as error:
                issue(catalog_pack_id, 'canonical_schema_unreadable', f'{reference}: {error}')
                continue
            if schema_entry.get('text') != authored_text:
                issue(catalog_pack_id, 'schema_text_mismatch', f'{schema_entry_id} <- {authored_path.relative_to(root)}')
                continue
            expected_format = 'yaml' if authored_path.suffix.lower() in ('.yaml', '.yml') else 'json'
            if schema_entry.get('format') != expected_format:
                issue(catalog_pack_id, 'schema_file_format_mismatch', f'{schema_entry_id}: {schema_entry.get("format")!r} != {expected_format!r}')
            matched_for_pack += 1
            matched_schema_count += 1
            closure_hash_rows.append((schema_entry_id, str(authored_path.relative_to(root)), sha256(authored_bytes)))

        catalog_schema_ids = {entry['id'] for entry in entries
                              if isinstance(entry, dict) and entry.get('pack') == pack_id
                              and entry.get('packVersion') == version
                              and str(entry.get('id', '')).startswith('schema:')}
        if catalog_schema_ids != expected_schema_ids:
            issue(catalog_pack_id, 'schema_closure_identity_mismatch',
                  f'catalog_only={sorted(catalog_schema_ids - expected_schema_ids)}; manifest_only={sorted(expected_schema_ids - catalog_schema_ids)}')
        per_pack.append({
            'id': pack_id,
            'version': version,
            'canonicalManifest': str(manifest_path.relative_to(root)),
            'sourceRoot': SOURCE_ROOTS[precedence],
            'declaredSchemas': len(declarations),
            'matchedSchemaSources': matched_for_pack,
        })

    for duplicate_id in duplicate_catalog_ids:
        issue(duplicate_id, 'duplicate_catalog_entry_id', duplicate_id)

    closure_material = json.dumps(sorted(closure_hash_rows), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return {
        'profile': PROFILE,
        'status': 'pass' if not mismatches else 'fail',
        'catalog': str(catalog_path.relative_to(root)) if catalog_path.is_relative_to(root) else str(catalog_path),
        'catalogSha256': sha256(catalog_bytes),
        'sourceRoots': list(SOURCE_ROOTS),
        'counts': {
            'catalogEntries': len(entries),
            'catalogPackManifests': len(packs),
            'matchedCanonicalManifests': source_manifest_count,
            'declaredSchemas': sum(row['declaredSchemas'] for row in per_pack),
            'matchedSchemaSources': matched_schema_count,
            'mismatches': len(mismatches),
        },
        'canonicalSourceClosureSha256': sha256(closure_material),
        'packs': per_pack,
        'mismatchDetails': mismatches,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=inferred_root(), help='UMF repository root')
    parser.add_argument('--catalog', type=Path, help='Catalog JSON (defaults to the current microsite dist catalog)')
    parser.add_argument('--receipt', type=Path, help='Optional JSON receipt output path')
    args = parser.parse_args()
    catalog_path = args.catalog if args.catalog else args.root / CATALOG_RELATIVE
    try:
        receipt = run(args.root, catalog_path)
    except Exception as error:
        print(json.dumps({'profile': PROFILE, 'status': 'error', 'error': str(error)}, indent=2), file=sys.stdout)
        return 2
    output = json.dumps(receipt, ensure_ascii=False, indent=2) + '\n'
    if args.receipt:
        args.receipt.write_text(output, encoding='utf-8')
    sys.stdout.write(output)
    return 0 if receipt['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())

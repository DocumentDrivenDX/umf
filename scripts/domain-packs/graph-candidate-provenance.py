"""Verify declared graph candidates against their original local source artifacts.

Historical candidates retain their own pack revision. This host-only audit does
not certify compatibility with current packs or native graph consumers.
"""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


def load(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON member')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs)


def local(base, reference):
    if not isinstance(reference, str) or not reference or ':' in reference:
        raise ValueError('Explicit local artifact reference required')
    relative = Path(reference)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Artifact path escapes repository')
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base.resolve()) or not path.is_file():
        raise ValueError('Local artifact file required')
    return path


def verify_candidate(base, entry):
    """Check one declared candidate; current metadata never replaces its origin."""
    base = Path(base)
    if not isinstance(entry, dict) or set(entry) != {'pack', 'fixture', 'archive', 'source_pack'}:
        raise ValueError('Unknown graph-candidate declaration')
    pack_id = entry['pack']
    if not isinstance(pack_id, str) or not pack_id or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in pack_id):
        raise ValueError('Explicit pack directory identity required')
    if entry['fixture'] != f'spec/domain-packs/{pack_id}/graph/fixture.json':
        raise ValueError('Candidate fixture does not belong to declared pack')
    source_bytes = local(base, entry['source_pack']).read_bytes()
    original = load(source_bytes)
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    graph = load(local(base, entry['fixture']).read_bytes())
    expected_pack = {'id': original['id'], 'version': original['version'], 'sha256': source_hash}
    if original['id'] != pack_id or graph.get('format') != 'umf.domain-graph' or graph.get('version') != '1.0.0' or graph.get('pack') != expected_pack:
        raise ValueError('Candidate original pack identity/bytes differ')
    archive_path = local(base, entry['archive'])
    if graph.get('dataset', {}).get('archive_sha256') != hashlib.sha256(archive_path.read_bytes()).hexdigest():
        raise ValueError('Candidate original archive bytes differ')
    with ZipFile(archive_path) as archive:
        if len(archive.namelist()) != len(set(archive.namelist())):
            raise ValueError('Ambiguous archive member inventory')
        manifest = load(archive.read('manifest.json'))
        derived = load(archive.read('domain-pack.json'))
        if manifest.get('format') != 'tablespec.csv-pack' or manifest.get('domain') != pack_id or derived.get('id') != pack_id or derived.get('version') != original['version']:
            raise ValueError('Candidate archive pack identity differs')
        if graph.get('source_metadata') != derived.get('sources', {}) or graph.get('source_bindings') != derived.get('source_bindings', []) or graph.get('run') != manifest.get('run'):
            raise ValueError('Candidate original source/run provenance differs')
        if graph['dataset'] != {'archive_sha256': graph['dataset']['archive_sha256'], 'origin': manifest['origin'], 'seed': manifest['seed']}:
            raise ValueError('Candidate original dataset provenance differs')
        run = manifest.get('run')
        if run is None:
            if derived != original:
                raise ValueError('Fixed archive metadata differs from original pack')
        elif run.get('source_pack') != expected_pack:
            raise ValueError('Replay archive original pack pin differs')
        targets = original['execution_profile']['targets']['graph']
        schemas = [s for s in original['schemas'] if s['id'] in targets]
        if len(schemas) != 1 or schemas[0]['format'] != 'umf':
            raise ValueError('One original graph schema required')
        reference = schemas[0]['reference']
        schema = archive.read(manifest['schema_artifacts'][reference])
        if graph.get('schema') != {'id': load(schema)['id'], 'revision': original['version'], 'sha256': hashlib.sha256(schema).hexdigest()}:
            raise ValueError('Candidate original ontology pin differs')
    current_bytes = local(base, f'spec/domain-packs/{pack_id}/pack.json').read_bytes()
    current = load(current_bytes)
    if current.get('id') != pack_id:
        raise ValueError('Current pack identity differs')
    same = current_bytes == source_bytes
    if not same and current['version'] == original['version']:
        raise ValueError('Same pack version has conflicting original bytes')
    return {'pack': pack_id, 'classification': 'current-pack' if same else 'historical-pack',
            'source_version': original['version'], 'current_version': current['version'],
            'source_sha256': source_hash, 'fixture': entry['fixture'], 'archive': entry['archive']}


def verify_inventory(base):
    base = Path(base)
    inventory = load(local(base, 'fixtures/domain-packs/graph-candidates.json').read_bytes())
    if set(inventory) != {'format', 'version', 'candidates'} or inventory['format'] != 'umf.domain-graph-candidate-inventory' or inventory['version'] != '1.0.0' or not isinstance(inventory['candidates'], list):
        raise ValueError('Supported explicit graph-candidate inventory required')
    entries = inventory['candidates']
    if any(not isinstance(e, dict) or set(e) != {'pack', 'fixture', 'archive', 'source_pack'}
           or not isinstance(e['pack'], str) or not isinstance(e['fixture'], str) for e in entries):
        raise ValueError('Explicit graph-candidate declarations required')
    names = [e['pack'] for e in entries]
    if len(names) != len(set(names)):
        raise ValueError('Duplicate graph-candidate declaration')
    actual = {p.relative_to(base).as_posix() for p in (base / 'spec/domain-packs').glob('*/graph/fixture.json')}
    if actual != {e['fixture'] for e in entries}:
        raise ValueError('Undeclared or missing graph candidate')
    results = [verify_candidate(base, entry) for entry in entries]
    packs = {p.parent.name for p in (base / 'spec/domain-packs').glob('*/pack.json')}
    if not set(names).issubset(packs):
        raise ValueError('Graph candidate has no current pack')
    return {'format': 'umf.graph-candidate-provenance-audit', 'version': '1.0.0',
            'candidates': results, 'without_candidate': sorted(packs - set(names)),
            'qualification': 'Artifact provenance only. Historical candidates do not qualify current pack revisions; absent candidate data does not negate schema-only graph targets. No native graph admission.'}


if __name__ == '__main__':
    print(json.dumps(verify_inventory(Path(__file__).resolve().parents[2]), indent=2))

"""Development-only portable graph candidate from exact pack/CSV source identities.

No Truss/Ashlar native storage ID allocation, execution or ontology reasoning.
"""
import argparse
import csv
from copy import deepcopy
import hashlib
import io
import json
import subprocess
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile


def project(pack_path, output, archive_path=None):
    pack_path = pack_path.resolve(strict=True)
    root = pack_path.parent
    subprocess.run(['bun', str(Path(__file__).with_name('admit.ts')), str(pack_path)], check=True, capture_output=True)
    pack = json.loads(pack_path.read_text())
    profile = pack['execution_profile']
    def local(reference):
        ref = Path(reference)
        if ref.is_absolute() or '..' in ref.parts or ':' in reference:
            raise ValueError('Nonlocal artifact')
        path = (root / ref).resolve(strict=True)
        if not path.is_relative_to(root):
            raise ValueError('Artifact escapes pack')
        if path.stat().st_size > 10 * 1024 * 1024:
            raise ValueError('Artifact byte budget')
        return path
    declarations = {s['id']: s for s in pack['schemas']}
    if len(profile['targets'].get('graph', [])) != 1:
        raise ValueError('Projector requires exactly one selected ontology')
    ontology_bytes = local(declarations[profile['targets']['graph'][0]]['reference']).read_bytes()
    ontology = json.loads(ontology_bytes)
    modules = [m for m in ontology['modules'] if m['id'] == 'domain']
    if len(modules) != 1:
        raise ValueError('Missing domain ontology module')
    elements = {e['id']: e for e in modules[0]['elements']}
    relationships = {r['id']: r for r in modules[0].get('relationships', [])}
    schemas = {name: json.loads(local(declarations[name]['reference']).read_text()) for name in profile['targets'].get('tabular', [])}
    if not schemas:
        raise ValueError('No selected tabular schemas')
    for name, schema in schemas.items():
        record = elements.get(name, {})
        if record.get('kind') != 'record' or record.get('members') != [{'module':'domain','element':name+'.'+c['name']} for c in schema['columns']]:
            raise ValueError('Ontology record correspondence mismatch')
        if record.get('keys', [{}])[0].get('fields') != [{'module':'domain','element':name+'.'+c} for c in schema['primary_key']]:
            raise ValueError('Ontology identity correspondence mismatch')
        for fk in schema.get('relationships', {}).get('foreign_keys', []):
            r = relationships.get(name+'.'+fk['column'], {})
            if r.get('source') != [{'module':'domain','element':name}] or r.get('target') != [{'module':'domain','element':fk['references_table'],'key':'identity'}]:
                raise ValueError('Ontology relationship correspondence mismatch')
    bindings = {b['schema_id']: b['source_id'] for b in pack.get('source_bindings', []) if b['role'] == 'rows'}
    archive = ZipFile(archive_path) if archive_path else None
    provenance, run = pack, None
    if archive:
        if len(archive.namelist()) != len(set(archive.namelist())) or sum(i.file_size for i in archive.infolist()) > 100*1024*1024:
            raise ValueError('Archive inventory or byte budget')
        manifest = json.loads(archive.read('manifest.json'))
        provenance = json.loads(archive.read('domain-pack.json'))
        run = manifest.get('run')
        if manifest.get('format') != 'tablespec.csv-pack' or manifest.get('domain') != pack['id'] or provenance.get('id') != pack['id'] or provenance.get('version') != pack['version'] or provenance.get('schemas') != pack['schemas'] or provenance.get('execution_profile') != profile or set(manifest['tables']) != set(schemas):
            raise ValueError('Archive pack correspondence mismatch')
        constants = {'version':1,'encoding':'UTF-8','null_value':'\\N','header':True,'delimiter':',','quote':'"','line_ending':'\n'}
        if any(manifest.get(k) != v for k,v in constants.items()):
            raise ValueError('Unsupported archive encoding contract')
        required = set(profile['include_sources']) | {b['source_id'] for b in pack.get('source_bindings',[]) if b['role']=='rows' and b['schema_id'] in schemas}
        references = {pack['sources'][id]['reference'] for id in required if pack['sources'][id].get('reference') and ':' not in pack['sources'][id]['reference']}
        if set(manifest.get('source_artifacts',{})) != references:
            raise ValueError('Incomplete included source inventory')
        if profile['mode'] == 'scenario-replay':
            if not run or run.get('source_pack') != {'id':pack['id'],'version':pack['version'],'sha256':hashlib.sha256(pack_path.read_bytes()).hexdigest()} or run.get('generator') != {'id':'tablespec.scenario-replay','version':'1.0.0'} or run.get('components') != profile['scales'].get(run.get('scale')):
                raise ValueError('Archive replay custody mismatch')
            inputs = {id:source['checksum'] for id,source in pack['sources'].items() if source.get('reference') in references}
            schema_hashes = {s['reference']:hashlib.sha256(local(s['reference']).read_bytes()).hexdigest() for s in pack['schemas']}
            if run.get('input_hashes') != inputs or run.get('schema_hashes') != schema_hashes or run.get('origin') != 'synthetic' or type(run.get('seed')) is not int or manifest.get('seed') != run['seed'] or manifest.get('origin') != 'synthetic':
                raise ValueError('Archive run provenance mismatch')
            expected = deepcopy(pack)
            expected['sources']['scenario_replay_output'] = {'kind':'synthetic','data_kind':'fabricated','generator':run['generator'],'parameters':{'seed':run['seed'],'components':run['components']},'provenance':{'source_ids':sorted(inputs),'transformations':['Trusted independent-component replay with consistent identity remapping; source values unchanged.']}}
            expected['template_source_bindings'] = deepcopy(pack.get('source_bindings',[]))
            expected['template_fixture_counts'] = deepcopy(pack.get('fixture_counts',{}))
            expected['fixture_counts'] = {name:count*run['components'] for name,count in pack.get('fixture_counts',{}).items()}
            if sum(expected['fixture_counts'].values())>1000000 or any(manifest['tables'][name]['rows']!=count for name,count in expected['fixture_counts'].items()):
                raise ValueError('Replay expansion count or budget mismatch')
            for binding in expected.get('source_bindings',[]):
                if binding['role']=='rows' and binding['schema_id'] in schemas:
                    binding['source_id']='scenario_replay_output'
            if provenance != expected:
                raise ValueError('Archive derived source metadata mismatch')

        elif provenance != pack:
            raise ValueError('Fixed archive metadata differs from pack')
        else:
            kinds = {pack['sources'][bindings[name]]['kind'] for name in schemas}
            if kinds == {'external'}:
                if manifest.get('origin')!='external' or manifest.get('seed') is not None or run is not None:
                    raise ValueError('Fixed external archive run metadata mismatch')
            elif kinds == {'synthetic'}:
                if manifest.get('origin')!='synthetic' or type(manifest.get('seed')) is not int or run is not None:
                    raise ValueError('Legacy synthetic archive run metadata mismatch')
            else:
                raise ValueError('Unsupported fixed archive source origin')
        for declaration in pack['schemas']:
            if archive.read(manifest['schema_artifacts'][declaration['reference']]) != local(declaration['reference']).read_bytes():
                raise ValueError('Archive schema differs from admitted pack')
        for source in pack.get('sources', {}).values():
            reference = source.get('reference','')
            if reference in manifest.get('source_artifacts', {}):
                data = archive.read(manifest['source_artifacts'][reference])
                if hashlib.sha256(data).hexdigest() != source['checksum']['value'] or data != local(reference).read_bytes():
                    raise ValueError('Archive input source differs from admitted pack')
    objects, edges, keys, rows_by_table = [], [], {}, {}
    key_set = set()
    try:
        for name, schema in schemas.items():
            if archive:
                table = manifest['tables'][name]
                if table['file'] != 'data/'+name+'.csv':
                    raise ValueError('Unexpected archive table path')
                text = archive.read(table['file']).decode()
            else:
                source = pack['sources'][bindings[name]]
                reference = Path(source['reference'])
                if reference.is_absolute() or '..' in reference.parts or ':' in source['reference']:
                    raise ValueError('Nonlocal fixture source')
                path = (root / reference).resolve(strict=True)
                if not path.is_relative_to(root.resolve()):
                    raise ValueError('Source symlink escapes pack')
                source_bytes = path.read_bytes()
                if hashlib.sha256(source_bytes).hexdigest() != source['checksum']['value']:
                    raise ValueError('Source bytes changed')
                text = source_bytes.decode()
            rows = list(csv.DictReader(io.StringIO(text)))
            if len(rows) + len(objects) > 1000000:
                raise ValueError('Object budget exceeded')
            numeric = {c['name'] for c in schema['columns'] if c['data_type'] in ['DECIMAL','INTEGER','BIGINT','FLOAT','DOUBLE']}
            booleans = {c['name'] for c in schema['columns'] if c['data_type'] == 'BOOLEAN'}
            def typed(values):
                return [{k: Decimal(v) if k in numeric and v != '\\N' else v.lower() if k in booleans else v for k,v in row.items()} for row in values]
            if archive and len(rows) != manifest['tables'][name]['rows']:
                raise ValueError('Archive row count mismatch')
            if archive and profile['mode'] == 'scenario-replay':
                # Verify the declared derivation against pinned templates; arbitrary
                # archive rows cannot inherit template provenance.
                source = pack['sources'][bindings[name]]
                template_bytes = local(source['reference']).read_bytes()
                if hashlib.sha256(template_bytes).hexdigest() != source['checksum']['value']:
                    raise ValueError('Template checksum mismatch')
                originals = list(csv.DictReader(io.StringIO(template_bytes.decode())))
                if len(originals)*run['components'] != len(rows):
                    raise ValueError('Replay count differs from actual templates')
                expected = []
                for component in range(run['components']):
                    for original in originals:
                        expected.append({col: json.dumps([run['seed'],component,value],ensure_ascii=False,separators=(',',':')) if col in profile['identity_columns'][name] and value != '\\N' else value for col,value in original.items()})
                if typed(rows) != typed(expected):
                    raise ValueError('Archive rows differ from declared replay derivation')
            elif archive and name in bindings and pack['sources'][bindings[name]].get('reference'):
                source = pack['sources'][bindings[name]]
                original = local(source['reference']).read_bytes()
                if hashlib.sha256(original).hexdigest() != source['checksum']['value'] or typed(rows) != typed(list(csv.DictReader(io.StringIO(original.decode())))):
                    raise ValueError('Fixed archive rows differ from pinned input')
            rows_by_table[name] = rows
            for row in rows:
                if set(row) != {c['name'] for c in schema['columns']}:
                    raise ValueError('CSV field inventory mismatch')
                row = {k: None if v == '\\N' else v for k, v in row.items()}
                identity = [row[c] for c in schema['primary_key']]
                key = json.dumps([ontology['id'], 'domain', name, identity], ensure_ascii=False, separators=(',', ':'))
                if key in key_set:
                    raise ValueError('Duplicate graph identity')
                key_set.add(key)
                keys[(name, tuple(identity))] = key
                objects.append({'key': key, 'type': {'document': ontology['id'], 'module': 'domain', 'element': name}, 'values': {name + '.' + col: value for col, value in row.items()}})
        for name, rows in rows_by_table.items():
            schema = schemas[name]
            for row in rows:
                source_key = keys[(name, tuple(row[c] for c in schema['primary_key']))]
                for fk in schema.get('relationships', {}).get('foreign_keys', []):
                    target_value = row[fk['column']]
                    if target_value == '\\N':
                        continue
                    parent = schemas[fk['references_table']]
                    if parent['primary_key'] != [fk['references_column']]:
                        raise ValueError('Graph candidate supports primary-key FK targets only')
                    target_key = keys.get((fk['references_table'], (target_value,)))
                    if target_key is None:
                        raise ValueError('Unresolved structural FK; do not invent graph target')
                    relationship = name + '.' + fk['column']
                    edges.append({'key': json.dumps([ontology['id'], 'domain', relationship, source_key, target_key], ensure_ascii=False, separators=(',', ':')), 'relationship': {'document': ontology['id'], 'module': 'domain', 'id': relationship}, 'source': source_key, 'target': target_key})
                    if len(edges) > 4000000:
                        raise ValueError('Edge budget exceeded')
        result = {'format': 'umf.domain-graph', 'version': '1.0.0', 'schema': {'id': ontology['id'], 'revision': pack['version'], 'sha256': hashlib.sha256(ontology_bytes).hexdigest()}, 'qualification': 'Schema-targeted candidate. Values retain CSV lexical text, not UMF canonical Value carriers or native storage IDs. No graph consumer acceptance or OWL reasoning.', 'pack': {'id': pack['id'], 'version': pack['version'], 'sha256': hashlib.sha256(pack_path.read_bytes()).hexdigest()}, 'source_metadata': provenance.get('sources', {}), 'source_bindings': provenance.get('source_bindings', []), 'run': run, 'dataset': {'archive_sha256': hashlib.sha256(Path(archive_path).read_bytes()).hexdigest(), 'origin':manifest['origin'],'seed':manifest['seed']} if archive else {'origin':'pinned-template'}, 'objects': objects, 'edges': edges}
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        return result
    finally:
        if archive:
            archive.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pack', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--archive', type=Path)
    args = parser.parse_args()
    result = project(args.pack, args.output, args.archive)
    print(json.dumps({'pack': result['pack']['id'], 'objects': len(result['objects']), 'edges': len(result['edges'])}))

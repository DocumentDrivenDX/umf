"""Independent artifact correspondence/negative checks for graph candidates."""
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
from zipfile import ZipFile

base = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('graph_projector', Path(__file__).with_name('graph-fixtures.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
for root in sorted((base/'spec/domain-packs').iterdir()):
    pack = json.loads((root/'pack.json').read_text())
    graph = json.loads((root/'graph/fixture.json').read_text())
    archive = base/'fixtures/domain-packs'/f"{pack['id']}-1.0.0.zip"
    assert graph['dataset']['archive_sha256'] == hashlib.sha256(archive.read_bytes()).hexdigest()
    objects = {o['key']:o for o in graph['objects']}
    assert len(objects) == len(graph['objects'])
    with ZipFile(archive) as z:
        manifest = json.loads(z.read('manifest.json'))
        assert graph['run'] == manifest['run']
        total = 0
        for table,info in manifest['tables'].items():
            rows = list(csv.DictReader(io.StringIO(z.read(info['file']).decode())))
            schema = json.loads(z.read('schemas/'+table+'.json'))
            for row in rows:
                identity = [row[c] for c in schema['primary_key']]
                key = json.dumps([graph['schema']['id'],'domain',table,identity],ensure_ascii=False,separators=(',',':'))
                assert objects[key]['values'] == {table+'.'+c:None if v=='\\N' else v for c,v in row.items()}
            total += len(rows)
        assert total == len(objects)
    for edge in graph['edges']:
        assert edge['source'] in objects and edge['target'] in objects
    print(pack['id'], len(objects), len(graph['edges']))
with TemporaryDirectory() as temporary:
    root = Path(temporary)/'pack'
    shutil.copytree(base/'spec/domain-packs/commerce',root)
    path=root/'pack.json'; original=json.loads(path.read_text())
    for mutate in [lambda p:p['execution_profile'].update(version='999.0.0'),lambda p:p['schemas'][-1].update(reference='../ontology.json')]:
        pack=json.loads(json.dumps(original));mutate(pack);path.write_text(json.dumps(pack))
        try: module.project(path,Path(temporary)/'bad.json')
        except Exception: pass
        else: raise AssertionError('Malformed graph pack admitted')
    path.write_text(json.dumps(original))
    ontology_path=root/'ontology.json'; ontology=json.loads(ontology_path.read_text());ontology['modules'][0]['elements']=[];ontology['modules'][0]['relationships']=[];ontology_path.write_text(json.dumps(ontology))
    try: module.project(path,Path(temporary)/'bad.json')
    except Exception: pass
    else: raise AssertionError('Empty ontology admitted')
    shutil.rmtree(root)
    shutil.copytree(base/'spec/domain-packs/commerce',root)
    path=root/'pack.json'; ontology_path=root/'ontology.json'
    ontology=json.loads(ontology_path.read_text())
    next(e for e in ontology['modules'][0]['elements'] if e['id']=='customers.name')['scalarType']='boolean'
    ontology_path.write_text(json.dumps(ontology))
    try: module.project(path,Path(temporary)/'bad.json')
    except Exception: pass
    else: raise AssertionError('Incompatible field semantics admitted')
    forged=Path(temporary)/'forged.zip'
    with ZipFile(base/'fixtures/domain-packs/commerce-1.0.0.zip') as original, ZipFile(forged,'w') as target:
        for name in original.namelist():
            data=original.read(name)
            if name=='domain-pack.json':
                metadata=json.loads(data);metadata['sources']['template_customers']['data_kind']='observed';metadata['source_bindings'][0]['source_id']='invented-source';data=json.dumps(metadata).encode()
            target.writestr(name,data)
    try: module.project(base/'spec/domain-packs/commerce/pack.json',Path(temporary)/'bad.json',forged)
    except Exception: pass
    else: raise AssertionError('Forged source metadata admitted')
    try: module.project(base/'spec/domain-packs/payments/pack.json',Path(temporary)/'bad.json',base/'fixtures/domain-packs/commerce-1.0.0.zip')
    except Exception: pass
    else: raise AssertionError('Unrelated archive admitted')
    forged_medical=Path(temporary)/'forged-medical.zip'
    with ZipFile(base/'fixtures/domain-packs/medical-1.0.0.zip') as original, ZipFile(forged_medical,'w') as target:
        for name in original.namelist():
            data=original.read(name)
            if name=='manifest.json':
                metadata=json.loads(data);metadata.update(origin='synthetic',seed=42,run={'generator':'invented.generator'});data=json.dumps(metadata).encode()
            target.writestr(name,data)
    try: module.project(base/'spec/domain-packs/medical/pack.json',Path(temporary)/'bad.json',forged_medical)
    except Exception: pass
    else: raise AssertionError('Forged fixed medical run admitted')
print('All graph companions and refusal cases verified')

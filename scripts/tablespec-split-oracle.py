import hashlib,json,runpy,tempfile
from pathlib import Path
import tablespec.models.umf as model
captured=Path('native/tablespec/sources/src/tablespec/models/umf.py')
assert Path(model.__file__).read_bytes()==captured.read_bytes(), 'Native installed model differs from captured baseline'
loader_path=Path('native/tablespec/sources/src/tablespec/umf_loader.py')
Loader=runpy.run_path(str(loader_path))['UMFLoader']
def load(files):
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory)
        for name,text in files.items():
            path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
        result=Loader()._load_column_centric(root).model_dump(mode='json')
        result.pop('mtime',None)
        return result
rows=[]
for case in json.loads(Path('fixtures/tablespec/split.json').read_text())['results']:
    expected=load(case['input'])
    for output in case['exports']:
        recovered=load(output['files']);edited=load(output['editedFiles'])
        edited_expected=json.loads(json.dumps(expected));edited_expected['columns'][0]['description']='Edited description'
        assert recovered==expected
        assert edited==edited_expected
        rows.append({'id':case['id'],'format':output['format'],'recoveryAgrees':True,'editAgrees':True,'columns':[c['name'] for c in recovered['columns']]})
Path('fixtures/tablespec/split-oracle.json').write_text(json.dumps({'loaderSha256':hashlib.sha256(loader_path.read_bytes()).hexdigest(),'modelSha256':hashlib.sha256(captured.read_bytes()).hexdigest(),'cases':rows},indent=2)+'\n')
print({'comparisons':len(rows)*2,'passed':len(rows)*2})

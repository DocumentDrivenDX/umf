"""Check the pinned loader's filename-selection primitive independently."""
import hashlib,json,tempfile
from pathlib import Path
fixture=Path('fixtures/tablespec/boundaries.json')
data=json.loads(fixture.read_text())
loader=Path('native/tablespec/sources/src/tablespec/umf_loader.py')
assert 'sorted(columns_dir.glob("*.yaml"))' in loader.read_text()
with tempfile.TemporaryDirectory(prefix='umf-tablespec-boundaries-') as directory:
    root=Path(directory)
    for name,text in data['files'].items():
        file=root/name
        file.parent.mkdir(parents=True,exist_ok=True)
        file.write_text(text)
    selected=[str(p.relative_to(root)) for p in sorted((root/'columns').glob('*.yaml'))]
    assert selected==data['selected']
Path('fixtures/tablespec/boundaries-oracle.json').write_text(json.dumps({'selected':selected,'fixtureSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'loaderSha256':hashlib.sha256(loader.read_bytes()).hexdigest(),'scope':'Python pathlib filename selection used by the pinned loader; not a new Pydantic or pipeline validation claim.'},indent=2)+'\n')
print({'selected':len(selected),'preservedSidecars':len(data['paths'])-len(selected)})

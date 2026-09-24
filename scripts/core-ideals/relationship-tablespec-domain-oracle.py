"""Generate browser-portable expected types from the pinned native registry."""
import hashlib, importlib, json, runpy
from pathlib import Path
root=Path('native/tablespec/relationship-runtime')
manifest=json.loads((root/'sources.json').read_text());assert manifest['commit']=='647e8e566ad78b864282ec65c0b0b2237aa63084'
for entry in manifest['files']:
 assert hashlib.sha256(Path(entry['path']).read_bytes()).hexdigest()==entry['sha256']
module=importlib.import_module('tablespec.inference.domain_types')
assert Path(module.__file__).read_bytes()==(root/'domain_types.py').read_bytes()
assert module.DomainTypeRegistry._get_default_registry_path().read_bytes()==(root/'domain_types.yaml').read_bytes()
registry=runpy.run_path(str(root/'domain_types.py'))['DomainTypeRegistry'](registry_path=root/'domain_types.yaml')
installed=module.DomainTypeRegistry()
expected={name:registry.get_expected_base_type(name) for name in sorted(registry.list_domain_types())}
assert expected=={name:installed.get_expected_base_type(name) for name in sorted(installed.list_domain_types())}
result={'nativeVersion':manifest['commit'],'scope':'Pinned registry expected base types only, not domain inference or execution validation','expectedBaseTypes':expected,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'sources.json',root/'domain_types.py',root/'domain_types.yaml',Path(__file__)]}}
(root/'domain-base-types.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'domains':len(expected),'constrained':sum(v is not None for v in expected.values()),'types':sorted(set(v for v in expected.values() if v is not None))}))

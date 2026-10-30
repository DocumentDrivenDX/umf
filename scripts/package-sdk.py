# SPDX-License-Identifier: MIT OR Apache-2.0
"""Create one deterministic, installable SDK archive from the actual build."""
from pathlib import Path
import gzip, hashlib, io, json, tarfile

output = Path('.cache/sdk-distribution')
# Qualification builds also emit standalone adapter test bundles at dist root.
# Only the two public entry bundles belong to the SDK; declarations, schemas
# and optional backend resources retain their actual built directory inventory.
entry_bundles = {'umf.js', 'umf.js.map', 'loader-contract.js'}
export_directories = {'src', 'spec', 'postgresql', 'protobuf', 'runtime'}
def exported(path):
    relative = path.relative_to('dist')
    return relative.name in entry_bundles if len(relative.parts) == 1 else relative.parts[0] in export_directories
files = sorted(p for p in Path('dist').rglob('*') if p.is_file() and not p.name.startswith('._') and exported(p))
required = ['dist/umf.js', 'dist/src/index.d.ts', 'dist/spec/extensions/actions/package.json',
            'dist/spec/extensions/actions/schema.json', 'dist/loader-contract.js',
            'dist/spec/extensions/saga/package.json', 'dist/spec/extensions/saga/runtime.schema.json',
            'dist/runtime/wasm/index.js', 'dist/runtime/wasm/index.d.ts', 'dist/runtime/node/src/wire.js',
            'dist/runtime/wasm/pkg/umf_core_wasm.js', 'dist/runtime/wasm/pkg/umf_core_wasm_bg.wasm']
assert all(Path(p).is_file() for p in required), 'SDK build is incomplete'
assert all(not p.is_symlink() for p in files), 'SDK must contain regular build outputs'
manifest = {'profile': 'umf.sdk.distribution/1', 'bundledVocabularies': {'umf.actions': '0.1.0', 'umf.actions.saga': '0.1.0'},
            'sha256': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
with (output / 'umf-sdk.tgz').open('wb') as raw:
    with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w|') as archive:
            entries = [(p, str(p)) for p in files]
            entries += [(output / name, name) for name in ['package.json', 'README.md', 'manifest.json']]
            entries += [(Path(name), name) for name in ['LICENSE.md', 'LICENSE-MIT', 'LICENSE-APACHE']]
            for path, name in entries:
                data = path.read_bytes()
                entry = tarfile.TarInfo('package/' + name)
                entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
                archive.addfile(entry, io.BytesIO(data))
print(json.dumps({'archive': str(output / 'umf-sdk.tgz'), 'files': len(files), 'actionsBundled': True}))

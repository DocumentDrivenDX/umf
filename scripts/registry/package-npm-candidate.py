#!/usr/bin/env python3
"""Build a local dual-platform npm candidate from the two pinned SDK archives."""
import gzip
import hashlib
import io
import json
import argparse
from pathlib import Path, PurePosixPath
import tarfile

ARCHIVES = {
    'macos-aarch64': ('umf-sdk-0.10.11-macos-aarch64.tgz', 'darwin', 'arm64'),
    'linux-x86_64': ('umf-sdk-0.10.11-linux-x86_64.tgz', 'linux', 'x64'),
}
ARCHIVE_SHA256 = {
    'macos-aarch64': 'b187431fb89ac61749dececd5e79aa2852b6b8e77b99743e84c9d08e74b2d9c8',
    'linux-x86_64': '52145cff0ebf9323d5c29defd7da31cfe30445e74e6b60c7c099b9a17832d7c2',
}
NODE = 'package/dist/umf-node.js'
ADDON = 'package/dist/umf_core_node.node'
PKG = 'package/package.json'
MANIFEST = 'package/manifest.json'
RUST_MANIFEST = 'package/dist/rust-default-manifest.json'
LOAD = 'addon = require2("./umf_core_node.node");'

def sha(data): return hashlib.sha256(data).hexdigest()

def read_archive(path):
    result = {}
    with tarfile.open(path, 'r:gz') as tf:
        for member in tf.getmembers():
            p = PurePosixPath(member.name)
            if not member.isfile() or p.is_absolute() or '..' in p.parts or member.name in result:
                raise ValueError(f'unsafe/duplicate archive member: {member.name}')
            f = tf.extractfile(member)
            if f is None: raise ValueError(f'missing member bytes: {member.name}')
            result[member.name] = (member, f.read())
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', type=Path, required=True, help='directory containing the two pinned SDK archives')
    parser.add_argument('--output', type=Path, required=True, help='directory for the candidate tarball')
    args = parser.parse_args()
    inputs = {key: read_archive(args.assets / spec[0]) for key, spec in ARCHIVES.items()}
    for key, spec in ARCHIVES.items():
        actual = sha((args.assets / spec[0]).read_bytes())
        if actual != ARCHIVE_SHA256[key]: raise ValueError(f'{key} SDK archive SHA-256 mismatch: {actual}')
    names = [set(x) for x in inputs.values()]
    if names[0] != names[1]: raise ValueError('SDK archive member sets differ')
    mac, linux = inputs['macos-aarch64'], inputs['linux-x86_64']
    if not mac[ADDON][1] or not linux[ADDON][1] or mac[ADDON][1] == linux[ADDON][1]:
        raise ValueError('native addon inputs are empty or unexpectedly identical')
    ignored = {ADDON, MANIFEST, RUST_MANIFEST}
    for same in (NODE, PKG):
        if mac[same][1] != linux[same][1]: raise ValueError(f'expected identical source member: {same}')
    differing = [n for n in names[0] - ignored if mac[n][1] != linux[n][1]]
    if differing: raise ValueError(f'non-platform SDK bytes differ: {differing[:20]}')
    if {n for n in names[0] if mac[n][1] != linux[n][1]} != ignored:
        raise ValueError('input archives must differ in exactly the addon and two platform manifests')
    if not mac[MANIFEST][1] or not linux[MANIFEST][1]: raise ValueError('input archive manifest missing')
    base = {n: value[1] for n, value in mac.items()}
    node = base[NODE].decode('utf-8')
    if node.count(LOAD) != 1: raise ValueError('expected unique narrow native-addon require seam')
    base[NODE] = node.replace(LOAD, 'addon = require2("./native-addon.cjs");').encode()
    base['package/dist/native-addon.cjs'] = (
        "'use strict';\n" +
        "const p = process.platform, a = process.arch;\n" +
        "if (p === 'darwin' && a === 'arm64') module.exports = require('./umf_core_node-darwin-arm64.node');\n" +
        "else if (p === 'linux' && a === 'x64') module.exports = require('./umf_core_node-linux-x64.node');\n" +
        "else throw new Error(`@documentdrivendx/umf-core has no native addon for ${p}-${a}`);\n"
    ).encode()
    base['package/dist/umf_core_node-darwin-arm64.node'] = mac[ADDON][1]
    base['package/dist/umf_core_node-linux-x64.node'] = linux[ADDON][1]
    del base[ADDON]
    # The upstream build manifest describes one native build host. Rebase only
    # its packaging-facing asset closure onto the combined registry package.
    runtime_manifest = json.loads(base[RUST_MANIFEST])
    runtime_manifest['platform'] = {'scope': 'registry package supports darwin-arm64 and linux-x64'}
    runtime_manifest['nativeBuild'] = {'scope': 'two verified, prebuilt release addons; no rebuild performed'}
    runtime_manifest['assets'].pop('dist/umf_core_node.node', None)
    runtime_manifest['assets']['dist/umf_core_node-darwin-arm64.node'] = sha(base['package/dist/umf_core_node-darwin-arm64.node'])
    runtime_manifest['assets']['dist/umf_core_node-linux-x64.node'] = sha(base['package/dist/umf_core_node-linux-x64.node'])
    runtime_manifest['assets'][NODE.removeprefix('package/')] = sha(base[NODE])
    base[RUST_MANIFEST] = (json.dumps(runtime_manifest, indent=2) + '\n').encode()
    metadata = json.loads(base[PKG])
    metadata['name'] = '@documentdrivendx/umf-core'
    metadata['repository'] = {'type': 'git', 'url': 'https://github.com/DocumentDrivenDX/umf'}
    metadata.pop('private', None)
    metadata['files'] = ['dist/', 'README.md', 'LICENSE.md', 'LICENSE-MIT', 'LICENSE-APACHE', 'manifest.json']
    base[PKG] = (json.dumps(metadata, indent=2) + '\n').encode()
    manifest = json.loads(base[MANIFEST])
    manifest['sha256'] = {n.removeprefix('package/'): sha(b) for n,b in sorted(base.items()) if n != MANIFEST}
    manifest['registryAssembly'] = {
        'profile': 'umf.npm.dual-native-addon/1',
        'sourceArchives': {k: {'file': v[0], 'sha256': ARCHIVE_SHA256[k]} for k,v in ARCHIVES.items()},
        'nativeAddons': {k: sha(inputs[k][ADDON][1]) for k in ARCHIVES},
        'sharedMembersByteIdenticalExcept': sorted(ignored),
        'selector': 'dist/native-addon.cjs',
    }
    base[MANIFEST] = (json.dumps(manifest, indent=2) + '\n').encode()
    out = args.output / 'documentdrivendx-umf-core-0.10.11.tgz'
    args.output.mkdir(parents=True, exist_ok=True)
    # Preserve source archive member metadata for inherited files; use stable metadata for additions.
    with out.open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w') as tf:
                for name, data in sorted(base.items()):
                    original_name = name
                    original = mac.get(original_name, (None,))[0]
                    info = tarfile.TarInfo(name)
                    if original is not None:
                        info.mode, info.mtime, info.uid, info.gid = original.mode, original.mtime, original.uid, original.gid
                        info.uname, info.gname = original.uname, original.gname
                    else:
                        info.mode, info.mtime, info.uid, info.gid = 0o644, 0, 0, 0
                    info.size = len(data)
                    tf.addfile(info, io.BytesIO(data))
    verify(out, base)
    print(f'{out}\n{sha(out.read_bytes())}  {out.name}')

def verify(path, expected):
    actual = read_archive(path)
    if set(actual) != set(expected): raise ValueError('candidate archive member set mismatch')
    for n, b in expected.items():
        if actual[n][1] != b: raise ValueError(f'candidate member changed: {n}')
    runtime_manifest = json.loads(actual[RUST_MANIFEST][1])
    for rel, expected_hash in runtime_manifest['assets'].items():
        member = 'package/' + rel
        if member not in actual or sha(actual[member][1]) != expected_hash:
            raise ValueError(f'rust-default-manifest asset mismatch: {rel}')
    package = json.loads(actual[PKG][1])
    if package['name'] != '@documentdrivendx/umf-core' or package['version'] != '0.10.11' or package.get('private'):
        raise ValueError('registry package metadata mismatch')
    if package.get('license') != 'MIT OR Apache-2.0' or package.get('repository', {}).get('url') != 'https://github.com/DocumentDrivenDX/umf':
        raise ValueError('license/repository metadata mismatch')
    if actual['package/dist/native-addon.cjs'][1].count(b'require(') != 2:
        raise ValueError('selector does not have exactly the two addon routes')
    node = actual[NODE][1].decode()
    if LOAD in node or 'require2("./native-addon.cjs")' not in node: raise ValueError('Node entry seam mismatch')

if __name__ == '__main__': main()

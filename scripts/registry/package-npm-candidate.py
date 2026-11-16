#!/usr/bin/env python3
"""Assemble a registry SDK from verified platform release archives."""
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
    out = assemble("0.10.11", args.assets, args.output, ARCHIVES, ARCHIVE_SHA256)
    print(f'{out}\n{sha(out.read_bytes())}  {out.name}')


def assemble(version, assets, output, archives, archive_digests):
    inputs = {}
    for key, (filename, _, _) in archives.items():
        path = assets / filename
        if sha(path.read_bytes()) != archive_digests[key]:
            raise ValueError(f'{key} SDK archive SHA-256 mismatch')
        inputs[key] = read_archive(path)
        if json.loads(inputs[key][PKG][1])['version'] != version:
            raise ValueError(f'{key} SDK package version mismatch')
    primary = inputs['linux-x86_64']
    source_tree = json.loads(primary[MANIFEST][1])['sourceTreeSha256']
    addon_routes = {}
    for key, members in inputs.items():
        if members.keys() != primary.keys() or members[PKG][1] != primary[PKG][1]:
            raise ValueError(f'{key} SDK archive layout or package metadata differs')
        _, platform, arch = archives[key]
        distribution = json.loads(members[MANIFEST][1])
        runtime = json.loads(members[RUST_MANIFEST][1])
        if (distribution['sourceTreeSha256'] != source_tree
                or runtime['sourceClosure']['sha256'] != source_tree
                or runtime['packageVersion'] != version
                or runtime['platform']['os'] != platform
                or runtime['platform']['nodeArch'] != arch):
            raise ValueError(f'{key} SDK source, version or target differs')
        for name, digest in distribution['sha256'].items():
            if sha(members[f'package/{name}'][1]) != digest:
                raise ValueError(f'{key} SDK member checksum mismatch: {name}')
        if runtime['assets']['dist/umf_core_node.node'] != sha(members[ADDON][1]):
            raise ValueError(f'{key} native addon checksum mismatch')
        addon = members[ADDON][1]
        if not addon or any(addon == other for other in addon_routes.values()):
            raise ValueError(f'{key} native addon is empty or duplicated')
        addon_routes[f'{platform}-{arch}'] = addon
    base = {name: value[1] for name, value in primary.items()}
    node = base[NODE].decode('utf-8')
    if node.count(LOAD) != 1:
        raise ValueError('expected unique native-addon require seam')
    base[NODE] = node.replace(LOAD, 'addon = require2("./native-addon.cjs");').encode()
    selector = ["'use strict';", "const platform = process.platform + '-' + process.arch;", "switch (platform) {"]
    for route, addon in sorted(addon_routes.items()):
        filename = f'umf_core_node-{route}.node'
        selector.append(f'  case "{route}": module.exports = require("./{filename}"); break;')
        base[f'package/dist/{filename}'] = addon
    selector.extend(['  default: throw new Error(`@documentdrivendx/umf-core has no native addon for ${platform}`);', '}'])
    base['package/dist/native-addon.cjs'] = ('\n'.join(selector) + '\n').encode()
    del base[ADDON]
    # The upstream build manifest describes one native build host. Rebase only
    # its packaging-facing asset closure onto the combined registry package.
    runtime_manifest = json.loads(base[RUST_MANIFEST])
    runtime_manifest['platform'] = {'scope': 'registry package', 'targets': sorted(addon_routes)}
    runtime_manifest['nativeBuild'] = {'scope': 'verified platform addons from release archives'}
    runtime_manifest['assets'].pop('dist/umf_core_node.node', None)
    for route, addon in addon_routes.items():
        runtime_manifest['assets'][f'dist/umf_core_node-{route}.node'] = sha(addon)
    runtime_manifest['assets']['dist/native-addon.cjs'] = sha(base['package/dist/native-addon.cjs'])
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
        'profile': 'umf.npm.platform-native-addons/1',
        'sourceArchives': {k: {'file': v[0], 'sha256': archive_digests[k]} for k,v in archives.items()},
        'nativeAddons': {k: sha(inputs[k][ADDON][1]) for k in archives},
        'sharedRuntimeArchive': archives['linux-x86_64'][0],
        'selector': 'dist/native-addon.cjs',
    }
    base[MANIFEST] = (json.dumps(manifest, indent=2) + '\n').encode()
    out = output / f'documentdrivendx-umf-core-{version}.tgz'
    output.mkdir(parents=True, exist_ok=True)
    # Preserve source archive member metadata for inherited files; use stable metadata for additions.
    with out.open('wb') as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode='wb', mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w') as tf:
                for name, data in sorted(base.items()):
                    original_name = name
                    original = primary.get(original_name, (None,))[0]
                    info = tarfile.TarInfo(name)
                    if original is not None:
                        info.mode, info.mtime, info.uid, info.gid = original.mode, original.mtime, original.uid, original.gid
                        info.uname, info.gname = original.uname, original.gname
                    else:
                        info.mode, info.mtime, info.uid, info.gid = 0o644, 0, 0, 0
                    info.size = len(data)
                    tf.addfile(info, io.BytesIO(data))
    verify(out, base, version, len(addon_routes))
    return out

def verify(path, expected, version, route_count):
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
    if package['name'] != '@documentdrivendx/umf-core' or package['version'] != version or package.get('private'):
        raise ValueError('registry package metadata mismatch')
    if package.get('license') != 'MIT OR Apache-2.0' or package.get('repository', {}).get('url') != 'https://github.com/DocumentDrivenDX/umf':
        raise ValueError('license/repository metadata mismatch')
    if actual['package/dist/native-addon.cjs'][1].count(b'require(') != route_count:
        raise ValueError('selector route count mismatch')
    node = actual[NODE][1].decode()
    if LOAD in node or 'require2("./native-addon.cjs")' not in node: raise ValueError('Node entry seam mismatch')

if __name__ == '__main__': main()

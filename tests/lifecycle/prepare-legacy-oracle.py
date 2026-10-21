# SPDX-License-Identifier: MIT OR Apache-2.0
"""Prepare an isolated oracle from the published UMF v0.5.3 Python wheels."""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import subprocess
import urllib.request
import venv
import zipfile
from pathlib import Path

TAG = 'umf-v0.5.3'
BASE = f'https://github.com/DocumentDrivenDX/umf/releases/download/{TAG}'
SUMS_SHA256 = 'bfbfb6ffbeb16629f2db62aacabe4a794d8ed7a6f9606ba6b53c142bc58e10f9'
WHEELS = {
    'umf_codegen-0.1.0a2-py3-none-any.whl': '11da338987de1accd1eff626eed6d8395cb51c9e647e5c833fadae85f66d41c2',
    'umf_access-0.1.0.dev5-py3-none-any.whl': 'e4c77075281f82c2d1b67eba432a718f847b186d1e0293b034dceb068d1a9a9d',
}
DEPENDENCIES = ['mini-racer==0.14.1', 'pydantic==2.13.5', 'psycopg[binary]==3.2.13']


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def verify_record(path: Path) -> int:
    with zipfile.ZipFile(path) as archive:
        record_name = next(name for name in archive.namelist() if name.endswith('.dist-info/RECORD'))
        rows = list(csv.reader(io.StringIO(archive.read(record_name).decode('utf-8'))))
        for name, digest, size in rows:
            if not digest:
                continue
            algorithm, encoded = digest.split('=', 1)
            payload = archive.read(name)
            observed = base64.urlsafe_b64encode(hashlib.new(algorithm, payload).digest()).decode().rstrip('=')
            if observed != encoded or len(payload) != int(size):
                raise ValueError(f'{path.name}: wheel RECORD mismatch for {name}')
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    root = args.directory.resolve()
    if root.exists():
        raise FileExistsError(f'refusing to replace existing legacy oracle directory: {root}')
    wheels_dir = root / 'wheels'
    wheels_dir.mkdir(parents=True)
    sums = fetch(f'{BASE}/SHA256SUMS')
    sums_hash = hashlib.sha256(sums).hexdigest()
    if sums_hash != SUMS_SHA256:
        raise ValueError('published SHA256SUMS asset digest mismatch')
    published = {}
    for line in sums.decode('ascii').splitlines():
        digest, name = line.split(None, 1)
        published[name.strip().lstrip('*')] = digest
    records = {}
    for name, expected in WHEELS.items():
        if published.get(name) != expected:
            raise ValueError(f'{name}: release SHA256SUMS disagrees with pinned published digest')
        payload = fetch(f'{BASE}/{name}')
        observed = hashlib.sha256(payload).hexdigest()
        if observed != expected:
            raise ValueError(f'{name}: downloaded wheel differs from published digest')
        path = wheels_dir / name
        path.write_bytes(payload)
        records[name] = {'sha256': observed, 'recordEntries': verify_record(path)}

    environment = root / 'venv'
    venv.EnvBuilder(with_pip=True, clear=False).create(environment)
    python = environment / 'bin' / 'python'
    subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '--no-deps',
                    *(str(wheels_dir / name) for name in WHEELS)], check=True)
    subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', *DEPENDENCIES], check=True)
    probe = r'''import hashlib,json,sys
from importlib.metadata import version
from pathlib import Path
import umf_access,umf_codegen
from umf_codegen._release import MANIFEST_SHA256
from umf_codegen._embedded import files
manifest_bytes=files('umf_codegen').joinpath('_assets','manifest.json').read_bytes()
assert hashlib.sha256(manifest_bytes).hexdigest()==MANIFEST_SHA256
manifest=json.loads(manifest_bytes)
print(json.dumps({'python':sys.version.split()[0],'access':version('umf_access'),'codegen':version('umf-codegen'),
 'pydantic':version('pydantic'),'psycopg':version('psycopg'),'miniRacer':version('mini-racer'),
 'accessPath':str(Path(umf_access.__file__).resolve()),'codegenPath':str(Path(umf_codegen.__file__).resolve()),
 'codegenManifestSha256':MANIFEST_SHA256,'codegenBundleSha256':manifest['bundleSha256']}))'''
    result = subprocess.run([str(python), '-I', '-c', probe], check=True, capture_output=True, text=True)
    runtime = json.loads(result.stdout)
    if runtime['access'] != '0.1.0.dev5' or runtime['codegen'] != '0.1.0a2':
        raise ValueError('legacy oracle installed distributions do not match published UMF v0.5.3')
    report = {'releaseTag': TAG, 'releaseAssetBase': BASE, 'sha256sumsSha256': sums_hash,
              'wheels': records, 'dependencies': DEPENDENCIES, 'runtime': runtime,
              'oraclePython': str(python)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': 'prepared', 'oraclePython': str(python), 'report': str(args.report)}))


if __name__ == '__main__':
    main()

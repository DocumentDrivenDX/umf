#!/usr/bin/env python3
"""Create the isolated metadata-only packaging qualification tool environment."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import venv

WHEEL = pathlib.Path('/tool-input/packaging-25.0-py3-none-any.whl')
LOCK = pathlib.Path('/tool-input/requirements.lock')
WHEEL_SHA256 = '29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484'
LOCK_SHA256 = 'a00f933e87f072bf26e880dce84cde64e6644fa273def55f54f47d3846212212'
MAX_WHEEL = 1024 * 1024
MAX_COMMAND_CAPTURE = 256 * 1024
VENV = pathlib.Path('/tmp/g03-packaging250-qualification-tool')


def sha(path, limit):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise RuntimeError('unsafe or oversized input: ' + str(path))
    digest = hashlib.sha256()
    total = 0
    with path.open('rb') as stream:
        while block := stream.read(65536):
            total += len(block)
            if total > limit:
                raise RuntimeError('input grew beyond bound: ' + str(path))
            digest.update(block)
    return digest.hexdigest(), total


def run(argv):
    cp = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT, timeout=45, check=False)
    if len(cp.stdout) > MAX_COMMAND_CAPTURE:
        raise RuntimeError('tool setup command output exceeded bound')
    if cp.returncode:
        raise RuntimeError('isolated tool setup command failed: ' + cp.stdout[-2000:].decode('utf-8', 'replace'))
    return cp.stdout.decode('utf-8', 'replace')


if sys.version.split()[0] != '3.11.17' or sys.platform != 'linux':
    raise RuntimeError('selected image global Python identity differs from accepted input')
if sha(WHEEL, MAX_WHEEL) != (WHEEL_SHA256, 66469):
    raise RuntimeError('official packaging tool wheel digest/size mismatch')
if sha(LOCK, 4096)[0] != LOCK_SHA256:
    raise RuntimeError('packaging tool lock digest mismatch')
if VENV.exists() or VENV.is_symlink():
    raise RuntimeError('private qualification-tool venv path is already occupied')
venv.EnvBuilder(with_pip=True, system_site_packages=False, clear=False).create(VENV)
python = VENV / 'bin/python'
install = run([str(python), '-I', '-B', '-m', 'pip', '--isolated', 'install',
               '--disable-pip-version-check', '--no-index', '--no-deps', '--no-cache-dir',
               '--no-compile', '--require-hashes', '--find-links', '/tool-input',
               '-r', str(LOCK)])
if 'Successfully installed packaging-25.0' not in install:
    raise RuntimeError('tool venv did not report exact packaging installation')
result = run([str(python), '-I', '-B', '/control/probe.py'])
if len(result.encode()) > MAX_COMMAND_CAPTURE:
    raise RuntimeError('metadata probe result exceeded bounded stdout')
print(json.dumps({'profile': 'umf.g03-packaging250-tool-bootstrap/1',
                  'status': 'PASS_TOOL_SETUP_AND_PROBE', 'python': str(python),
                  'wheelSha256': WHEEL_SHA256, 'wheelSizeBytes': 66469,
                  'venvSystemSitePackages': False,
                  'installTranscriptSha256': hashlib.sha256(install.encode()).hexdigest(),
                  'probeStdoutSha256': hashlib.sha256(result.encode()).hexdigest(),
                  'probeStdout': result.strip()}, sort_keys=True))

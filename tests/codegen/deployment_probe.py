# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed original-compiler parity without a JS executable or network."""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.resources
import json
import os
import shutil
import socket
import subprocess
from pathlib import Path
from unittest.mock import patch

from umf_codegen import GenerationError, compile_table_deployment, verify_table_deployment

parser = argparse.ArgumentParser()
parser.add_argument('--corpus', required=True, type=Path)
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()
cases = json.loads(args.corpus.read_text())
observations = []
tamper_count = 0
native_cli = str(importlib.resources.files('umf').joinpath('_bin', 'umf'))
real_popen = subprocess.Popen
native_launches = []
def only_native_cli(command, *args, **kwargs):
    assert command[0] == native_cli and command[1] == 'codegen', command
    assert kwargs.get('cwd') == str(Path(native_cli).parent), kwargs
    assert command[2:] == ['--capabilities'] or command[2:] == [
        'deployment', '--request', '-', '--input-format', 'json', '--output-format', 'json'
    ] or command[2:] == [
        'verify-deployment', '--request', '-', '--input-format', 'json', '--output-format', 'json'
    ], command
    native_launches.append(command)
    return real_popen(command, *args, **kwargs)
with patch.object(subprocess,'Popen',side_effect=only_native_cli), \
     patch.object(shutil,'which',side_effect=AssertionError('executable lookup forbidden')), \
     patch.object(socket,'create_connection',side_effect=AssertionError('external network forbidden')), \
     patch.dict(os.environ,{'PATH':''}):
    for case in cases:
        result = compile_table_deployment(**case['request'])
        assert result == case['expected'], case['name']
        if result['status'] == 'compiled':
            assert verify_table_deployment(result['bundle']) == result['bundle']
            for mutation in ('sql','source','order','configuration','unknown'):
                changed = copy.deepcopy(result['bundle'])
                if mutation == 'sql':
                    changed['steps'][0]['sql'] = 'DROP SCHEMA public CASCADE'
                elif mutation == 'source':
                    changed['source']['utf8'] += ' '
                elif mutation == 'order':
                    changed['steps'].reverse()
                elif mutation == 'configuration':
                    changed['configuration']['schema'] = 'forged_schema'
                else:
                    changed['unknown'] = True
                # ASCII object keys and integral numeric members in these fixtures
                # make this exact RFC8785, including after each deliberate change.
                del changed['bundleDigest']
                changed['bundleDigest'] = hashlib.sha256(json.dumps(changed,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                try:
                    verify_table_deployment(changed)
                except GenerationError as error:
                    assert error.code == 'TABLE_DEPLOYMENT_UNSUPPORTED'
                else:
                    raise AssertionError('forged bundle admitted: '+mutation)
                tamper_count += 1
        observations.append({'name':case['name'],'status':result['status'],'completeParity':True})
assert native_launches
report = {'scope':'installed initial deployment compiler and source recompilation only','cases':observations,'tamperControls':tamper_count,'externalJavascriptProcesses':'forbidden','nativeCliLaunches':len(native_launches),'nativeLifecycleReleaseQualified':False}
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'parityCases':len(observations),'tamperControls':tamper_count}))

# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed migration parity with executable discovery/process/network forbidden."""
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

from umf_codegen import GenerationError, compile_table_migration, verify_table_migration

parser=argparse.ArgumentParser()
parser.add_argument('--corpus',required=True,type=Path)
parser.add_argument('--report',required=True,type=Path)
args=parser.parse_args()
cases=json.loads(args.corpus.read_text())
observations=[]
tamper_count=0
native_cli=str(importlib.resources.files('umf').joinpath('_bin','umf'))
real_popen=subprocess.Popen
native_launches=[]
def only_native_cli(command,*args,**kwargs):
    assert command[0]==native_cli and command[1]=='codegen',command
    assert kwargs.get('cwd')==str(Path(native_cli).parent),kwargs
    assert command[2:]==['--capabilities'] or command[2:] in (
        ['migration','--request','-','--input-format','json','--output-format','wire'],
        ['verify-migration','--request','-','--input-format','json','--output-format','wire'],
    ),command
    native_launches.append(command)
    return real_popen(command,*args,**kwargs)
with patch.object(subprocess,'Popen',side_effect=only_native_cli), \
     patch.object(shutil,'which',side_effect=AssertionError('executable lookup forbidden')), \
     patch.object(socket,'create_connection',side_effect=AssertionError('external network forbidden')), \
     patch.dict(os.environ,{'PATH':''}):
    for case in cases:
        request=case['request']
        result=compile_table_migration(migration_id=request['id'],predecessor=request['predecessor'],
                                       previous_bundle=request['previous'],next_bundle=request['next'])
        assert result==case['expected'],case['name']
        if result['status']=='compiled':
            assert verify_table_migration(result['plan'])==result['plan']
            for mutation in ('sql','order','source','from','to','approval','precondition','outcome','verification','recovery','unknown'):
                changed=copy.deepcopy(result['plan'])
                if not changed['steps'] and mutation in ('sql','order','precondition','outcome','verification','recovery'):
                    changed['steps']=[{'sql':'unapproved','mutation':mutation}]
                elif mutation=='sql':changed['steps'][0]['sql']='DROP SCHEMA public CASCADE'
                elif mutation=='order':
                    if len(changed['steps'])>1:changed['steps'].reverse()
                    else:changed['steps'].append(copy.deepcopy(changed['steps'][0]))
                elif mutation=='source':changed['next']['source']['utf8']+=' '
                elif mutation=='from':changed['fromBundleDigest']='0'*64
                elif mutation=='to':changed['toBundleDigest']='0'*64
                elif mutation=='approval':changed['requiresApproval']=False
                elif mutation=='precondition':changed['steps'][0]['preconditions']['phase']='after-plan'
                elif mutation=='outcome':changed['steps'][0]['expectedOutcome']['bundleDigest']='0'*64
                elif mutation=='verification':changed['steps'][0]['verification']='none'
                elif mutation=='recovery':changed['steps'][0]['recovery']='retry'
                else:changed['unknown']=True
                del changed['digest']
                # Fixtures use ASCII object keys and integral numbers: this is
                # exact RFC8785, including non-ASCII string values and sources.
                changed['digest']=hashlib.sha256(json.dumps(changed,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                try:
                    verify_table_migration(changed)
                except GenerationError as error:
                    assert error.code=='TABLE_MIGRATION_UNSUPPORTED',error.code
                else:
                    raise AssertionError('forged plan admitted: '+mutation)
                tamper_count+=1
        observations.append({'name':case['name'],'status':result['status'],'completeParity':True})
    for timeout in (0,-1,61,True):
        try:
            verify_table_migration({},timeout_seconds=timeout)
        except ValueError:
            pass
        else:
            raise AssertionError('invalid deadline admitted')
assert native_launches
report={'scope':'installed original migration-plan compiler/verifier; no native migration admission',
        'cases':observations,'tamperControls':tamper_count,'deadlineControls':4,
        'externalJavascriptProcesses':'forbidden','nativeCliLaunches':len(native_launches),'nativeLifecycleReleaseQualified':False}
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'parityCases':len(observations),'tamperControls':tamper_count,'deadlineControls':4}))

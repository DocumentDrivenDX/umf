# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed native parity, writer faults and trusted-resource controls."""
from __future__ import annotations

import argparse
import copy
import contextlib
import io
import hashlib
import importlib.metadata
import importlib.resources
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

from umf_codegen import GenerationError, generate_python_client
from umf_codegen._writer import OutputError, check_package, write_package

parser = argparse.ArgumentParser()
parser.add_argument('--corpus', required=True, type=Path)
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()
corpus = json.loads(args.corpus.read_text())
results = []

def tree(path):
    return {str(p.relative_to(path)):p.read_bytes() for p in path.rglob('*') if p.is_file()}


def refuses(code, operation):
    try:
        operation()
    except (GenerationError, OutputError) as error:
        assert error.code == code, (error.code, code)
        return error
    raise AssertionError('expected refusal: '+code)


real_popen = subprocess.Popen
worker_launches = []
native_cli = str(importlib.resources.files('umf').joinpath('_bin', 'umf'))
codegen_operations = {'generate', 'deployment', 'verify-deployment', 'migration',
                      'verify-migration', 'discover-changes', 'row-scope'}

def only_native_worker(command, *args, **kwargs):
    assert command[0] == native_cli, command
    assert kwargs.get('cwd') == str(Path(native_cli).parent), kwargs
    assert (command == [native_cli, 'codegen', '--capabilities'] or
            (len(command) == 9 and command[1] == 'codegen' and command[2] in codegen_operations
             and command[3:] == ['--request', '-', '--input-format', 'json',
                                  '--output-format', 'wire'])), command
    worker_launches.append(command)
    return real_popen(command, *args, **kwargs)

with patch.object(subprocess,'Popen',side_effect=only_native_worker), \
     patch.object(shutil,'which',side_effect=AssertionError('executable lookup forbidden')), \
     patch.object(socket,'create_connection',side_effect=AssertionError('external network forbidden')), \
     patch.dict(os.environ,{'PATH':''}):
    for item in corpus:
        request = dict(item['request'])
        text = request.pop('text')
        try:
            result = generate_python_client(text,**request)
            observed = {'ok':True,'result':result}
        except GenerationError as error:
            observed = {'ok':False,'error':{'code':error.code,'message':str(error)}}
            if error.path is not None: observed['error']['path']=error.path
        assert observed == item['expected'], item['name']
        results.append({'name':item['name'],'accepted':observed['ok'],'completeBytesAndRefusalEqual':True})
    result = corpus[0]['expected']['result']
    with tempfile.TemporaryDirectory(dir=Path(tempfile.gettempdir()).resolve(),prefix='umf-codegen-writer-') as directory:
        parent=Path(directory)
        output=parent/'generated'
        assert len(check_package(output,result))==len(result['files'])
        assert list(parent.iterdir())==[],'check created output or lock'
        write_package(output,result)
        before=tree(parent)
        mtimes={str(p.relative_to(parent)):p.stat().st_mtime_ns for p in parent.rglob('*')}
        assert check_package(output,result)==[]
        assert before==tree(parent)
        assert mtimes=={str(p.relative_to(parent)):p.stat().st_mtime_ns for p in parent.rglob('*')},'check mutated timestamps'
        # Compiled catalogs have a separate owner and survive regeneration.
        catalog=output/'shop/_umf/catalog.json'
        catalog.write_bytes(b'{"retained":true}\n')
        write_package(output,result)
        assert catalog.read_bytes()==b'{"retained":true}\n'
        previous=tree(output)
        def fail_install(stage):
            if stage=='before-install-rename': raise OSError('injected installation failure')
        refuses('WRITE_FAILED',lambda:write_package(output,result,fault=fail_install))
        assert tree(output)==previous,'failed installation lost original output'
        extra=output/'untracked.txt';extra.write_text('owned by author')
        refuses('OUTPUT_CHANGED',lambda:write_package(output,result))
        assert extra.read_text()=='owned by author'
        extra.unlink()
        modified=output/'shop/models.py';modified.write_text('hand edit')
        refuses('OUTPUT_CHANGED',lambda:write_package(output,result))
        assert modified.read_text()=='hand edit'
        # A symlink is never followed by generation or check.
        link=parent/'link';link.symlink_to(output,target_is_directory=True)
        refuses('OUTPUT_CHANGED',lambda:check_package(link,result))
        bad=copy.deepcopy(result);bad['files'][0]['path']='../escape.py'
        refuses('INVALID_CANDIDATE',lambda:write_package(parent/'unsafe',bad))
        fresh=parent/'recover';write_package(fresh,result)
        def fail_both(stage):
            if stage in ('before-install-rename','before-restore-rename'): raise OSError('injected rename failure')
        error=refuses('WRITE_UNRESOLVED',lambda:write_package(fresh,result,fault=fail_both))
        assert error.recovery is not None
        assert tree(Path(error.recovery)/'previous')=={f['path']:f['text'].encode() for f in result['files']}
        assert not fresh.exists()
    # The installed CLI must preserve CRLF source custody and keep check read-only.
    from umf_codegen.__main__ import main
    with tempfile.TemporaryDirectory(dir=Path(tempfile.gettempdir()).resolve(),prefix='umf-codegen-cli-') as directory:
        parent=Path(directory);schema=parent/'source.json';output=parent/'generated'
        selected=next(item for item in corpus if item['name']=='crlf-source')
        schema.write_bytes(selected['request']['text'].encode())
        flags=['--schema',str(schema),'--package','shop','--output',str(output)]
        with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            assert main(['generate',*flags])==0
            before=tree(parent)
            assert main(['check',*flags])==0
            assert tree(parent)==before
            assert tree(output)=={f['path']:f['text'].encode() for f in selected['expected']['result']['files']}
            try: main(['check',*flags,'--package','other'])
            except SystemExit as error: assert error.code==2
            else: raise AssertionError('duplicate flag accepted')
    refuses('GENERATION_TIMEOUT',lambda:generate_python_client(corpus[0]['request']['text'],package='shop',timeout_seconds=1e-12))
    import umf_codegen._native as native
    original=native.resources.files('umf_codegen').joinpath('_resources')
    with tempfile.TemporaryDirectory(dir=Path(tempfile.gettempdir()).resolve(),prefix='umf-codegen-integrity-') as directory:
        copied=Path(directory)
        shutil.copytree(original,copied/'_resources')
        with patch.object(native.resources,'files',return_value=copied):
            manifest=copied/'_resources/manifest.json'
            manifest.write_bytes(manifest.read_bytes()+b' ')
            refuses('ENGINE_UNAVAILABLE',native._load_resource_manifest)
        shutil.copyfile(original/'manifest.json',manifest)
        resource=copied/'_resources/core.schema.json';resource.write_bytes(resource.read_bytes()+b'corrupt')
        with patch.object(native.resources,'files',return_value=copied):
            refuses('ENGINE_UNAVAILABLE',native._load_resource_manifest)
    assert worker_launches, 'native worker was not launched'
report={'python':__import__('platform').python_version(),'generator':importlib.metadata.version('umf-codegen'),
        'engine':importlib.metadata.version('umf-core'),'cases':results,'writerAndIntegrityControls':'passed',
        'javascriptProcesses':'forbidden','nativeCliLaunches':len(worker_launches),'platform':__import__('platform').platform()}
args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'parityCases':len(results),'writerAndIntegrityControls':'passed'}))

#!/usr/bin/env python3
"""Exercise host controls and pre-allocation resource admission for R5 Python."""
import hashlib, json, sys
from pathlib import Path
from umf import rust_json_schema as api
source='{"type":"object"}'; base='https://schemas.example.test/root.json'
large='x' * 1_000_000
cases=[]
def call(label, fn):
    try: result={"status":"returned","value":fn()}
    except Exception as e: result={"status":"threw","name":type(e).__name__,"code":getattr(e,'code',None),"message":str(e)}
    cases.append({"id":label,"outcome":result})
call('work-budget-before-large-resource',lambda:api.import_json_schema(source,'urn:control',base,{'https://schemas.example.test/r.json':large},max_work=8))
call('cancellation-preflight',lambda:api.import_json_schema(source,'urn:control',base,is_cancelled=lambda:True))
call('deadline-preflight',lambda:api.import_json_schema(source,'urn:control',base,now=lambda:10,deadline_ms=5))
def bad_meter(_): raise RuntimeError('meter sentinel')
call('meter-hook-preflight',lambda:api.import_json_schema(source,'urn:control',base,meter=bad_meter))
hostile='{"allOf":['+'{"not":' * 128+'true'+'}' * 128+']}'
call('hostile-nesting-budget',lambda:api.import_json_schema(hostile,'urn:control',base,max_work=30))
receipt={"format":"umf-r5-json-schema-python-controls-v1","runtime":{"python":sys.version.split()[0]},"profile":api.profile_version(),"sourceArtifactProvenance":{"controlsScript":str(Path(__file__).resolve()),"controlsScriptSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),"pythonModule":str(Path(api.__file__).resolve()),"pythonModuleSha256":hashlib.sha256(Path(api.__file__).read_bytes()).hexdigest(),"nativeExtension":str(Path(api._rust._rust_core.__file__).resolve()),"nativeExtensionSha256":hashlib.sha256(Path(api._rust._rust_core.__file__).read_bytes()).hexdigest()},"caseCount":len(cases),"cases":cases,"openControls":["first and late meter failures","invalid control argument types","dict subclass and custom Mapping resource rejection","URI/source type admission","resource insertion and URI collision ordering","failure immutability","control-path matrix for all seven public operations"]}
print(json.dumps(receipt,ensure_ascii=True,indent=2))

"""Installed Python wheel probe: only public saga methods; one exact request."""
import json
import sys
from umf import SagaRuntime, __version__
request=json.load(sys.stdin)
try:
    result=getattr(SagaRuntime(),request['operation'])(*request['arguments'])
    json.dump({'ok':True,'result':result,'version':__version__},sys.stdout,ensure_ascii=True,allow_nan=False)
except Exception as error:
    json.dump({'ok':False,'error':{'code':getattr(error,'code','PYTHON_RUNTIME'),'message':str(error),'path':getattr(error,'path','')}},sys.stdout,ensure_ascii=True)

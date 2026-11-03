# SPDX-License-Identifier: MIT OR Apache-2.0
"""Proposed read-only fresh-public Core proof. Not executed against UMF locally."""
from pathlib import Path
import hashlib, importlib.metadata, json, platform, subprocess, sys, zipfile
from urllib.parse import urlsplit
SOURCE = 'e3f38ef6f05ae636d2837f9d69f8d6805222664b'
WHEEL = '2dd4f00869240b37aa89fb9009e0663bf4c78cde103995d9d5c6e6b2333d92dd'
NATIVE = '7716d79ae0c85ac92ba679d531c213811fe66501397b0ec0f78e8bad53c296da'
PINS = {'tools/verify_python_artifacts.py':'0ce62ccf70e89e14f95e7679473c9d58c1662042081f4b9c5b0eb7809854b355',
        'tests/rust-core/fixtures/access-inspection/cases.json':'2e939f0d0f68f71a6b78c38e4fcd151e7b363513311f1aed170f9576333cbdc3'}
def insist(v,m):
    if not v: raise ValueError(m)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def validate_report(report):
    rows=[r for r in report['install'] if r['metadata']['name'].lower().replace('_','-')=='umf-core']
    insist(len(rows)==1,'Expected one newly resolved public Core')
    r=rows[0];url=urlsplit(r['download_info']['url'])
    insist(r['metadata']['version']=='0.10.8' and url.scheme=='https' and url.hostname=='files.pythonhosted.org'
           and url.port in (None,443) and not url.username and not url.password
           and r['download_info']['archive_info']['hashes']['sha256']==WHEEL,'Wrong public Core origin/version/hash')
    return r

def probe(root,wheel,report_path,receipt):
    insist(sys.flags.isolated and sys.dont_write_bytecode,'Must use -I -B')
    insist(sys.version_info[:3]==(3,11,17) and (platform.system(),platform.machine())==('Linux','x86_64'),'Selected fresh-public host differs')
    for f,h in PINS.items():insist(sha(root/f)==h,'Frozen source probe/verifier differs: '+f)
    selected=validate_report(json.loads(report_path.read_text()))
    insist(sha(wheel)==WHEEL,'Selected exact public/GitHub-bound wheel differs')
    import umf
    from umf import _rust_core
    from umf.rust_codegen import CodegenEngine
    dist=importlib.metadata.distribution('umf-core');prefix=Path(sys.prefix).resolve()
    insist(dist.version==umf.__version__=='0.10.8' and dist.read_text('direct_url.json') is None,'Core was not installed normally from public index')
    insist(umf.current_core_version()=='0.10.0','Semantic Core identity differs')
    insist(_rust_core.engine_version()=='umf-core-r2' and _rust_core.codegen_protocol_version()=='umf-codegen-r3-seven-ops-nine-resources/1','Native engine/protocol differs')
    origins={}
    for m in (umf,_rust_core):
        p=Path(m.__file__).resolve();insist(p.is_relative_to(prefix),'Checkout/foreign import');origins[m.__name__]={'path':str(p),'sha256':sha(p)}
    insist(sha(Path(_rust_core.__file__))==NATIVE,'Loaded public native bytes differ')
    def strict():
        p=subprocess.run([sys.executable,'-I','-B',str(root/'tools/verify_python_artifacts.py'),'--wheel',str(wheel),'--verify-installed-wheel','--expected-version','0.10.8'],capture_output=True,text=True)
        insist(p.returncode==0,'Strict public installed-wheel check: '+p.stderr)
        r=json.loads(p.stdout);insist(r['status']=='passed' and r['wheel_sha256']==WHEEL and r['native_sha256']==NATIVE,'Strict wheel/native identity differs');return r
    before=strict();package=Path(umf.__file__).resolve().parent
    resources={n:json.loads((package/'action_runtime_resources'/(n+'.json')).read_text()) for n in ('coreSchema','referenceSchema','packageSchema','constraints','domainPolicy','tablesPackage','actionsPackage','bindingPackage','stableBindingPackage')}
    insist(sha(package/'action_runtime_resource_manifest.json')=='5eecd2e367ac58a38df0f4f32a8a7d9bef8020b8340dc4704583f7806d83d571','Installed canonical resource manifest differs')
    engine=CodegenEngine(resources);cases=json.loads((root/'tests/rust-core/fixtures/access-inspection/cases.json').read_text())['cases'];insist(len(cases)==17,'Inspection corpus differs')
    for case in cases:
        req=case['request'];original=json.dumps(req)
        insist(engine.call('inspectAccessViews',req)=={'ok':True,'result':case['expected']},'Dispatcher parity: '+case['id'])
        for carrier in (list,tuple):insist(engine.inspect_access_views(req['document'],req['selected'],carrier(req.get('bindings',[])),req.get('sourceId','logical'))==case['expected'],'Convenience parity: '+case['id'])
        insist(json.dumps(req)==original,'Request custody changed')
    after=strict();insist(before==after,'Public installed bytes/resources changed during probe')
    pydantic=importlib.metadata.version('pydantic');insist(pydantic=='2.14.2','Resolved public dependency cohort differs from actual admitted witness')
    receipt.write_text(json.dumps({'profile':'umf.fresh-public-core-correspondence/1','sourceS':SOURCE,'actualPython':platform.python_version(),'platform':platform.platform(),'selectedPublicCore':selected,'wheelSHA256':WHEEL,'nativeSHA256':NATIVE,'origins':origins,'inspectionCases':17,'inspectionCalls':51,'requestCustodyPreserved':True,'semanticCore':'0.10.0','canonicalResources':True,'strictBefore':before,'strictAfter':after,'pydantic':pydantic,'scope':'Actual fresh-public Linux311 Core proof only; no Access/Codegen PyPI/Weft/Truss or Mac313-native claim'},indent=2)+'\n')
if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('root','wheel','install-report','receipt'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();probe(a.root,a.wheel,a.install_report,a.receipt)

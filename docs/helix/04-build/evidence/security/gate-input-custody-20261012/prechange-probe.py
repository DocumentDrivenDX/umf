import json,os,subprocess,tempfile
from pathlib import Path
archive=Path(__file__).resolve().parent
inputs={'docs/helix/02-design/spikes/security/acceptance.ts':archive/'original-acceptance.ts','tools/security/run-command.ts':archive/'original-run-command.ts'}
with tempfile.TemporaryDirectory(prefix='umf-gate-plan-drift-') as tmp:
 root=Path(tmp)
 for p in ['docs/helix/02-design/spikes/security/acceptance.ts','tools/security/run-command.ts']:
  out=root/p;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(inputs[p].read_bytes())
 runner="""// @covers US-079-AC1
import {createHash} from 'node:crypto';
const paths=['runner.ts','oracle.json','implementation.ts'];
const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
const path='docs/helix/03-test/security/cases.json';const plan=await Bun.file(path).json();plan.cases[0].name='changed-during-run';await Bun.write(path,JSON.stringify(plan));
console.log(JSON.stringify({status:'passed',id:Bun.env.UMF_SECURITY_CASE_ID,backend:'semantic',runId:Bun.env.UMF_SECURITY_RUN_ID,command:['bun','runner.ts'],covers:['US-079-AC1'],versions:{bun:Bun.version},sourceDigests,observations:[{assertionId:Bun.env.UMF_SECURITY_CASE_ID,expected:1,observed:1}]}));
"""
 (root/'runner.ts').write_text(runner);(root/'oracle.json').write_text('{}');(root/'implementation.ts').write_text('export const original=true;')
 p=root/'docs/helix/03-test/security/cases.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps({'cases':[{'id':'plan-drift','backend':'semantic','name':'original','required':True,'covers':['US-079-AC1'],'command':['bun','runner.ts'],'testSource':'runner.ts','oracleSource':'oracle.json','implementationSources':['implementation.ts'],'assertionIds':['plan-drift'],'timeoutMs':10000}]}))
 result=subprocess.run(['/opt/homebrew/bin/bun','docs/helix/02-design/spikes/security/acceptance.ts'],cwd=root,env=os.environ,capture_output=True,text=True,timeout=15)
 report=json.loads((root/'docs/helix/04-build/evidence/security/acceptance.json').read_text());assert report['execution'][0]['accepted'] is True;print(json.dumps({'caseAccepted':report['execution'][0]['accepted'],'errors':report['errors'],'scope':'Isolated original gate source: changing plan name during valid runner still accepted its case. Full one-case gate remains failed for unallocated criteria.'},indent=2))

from pathlib import Path
import subprocess,json
h='/private/tmp/sdk-public-stream-rewrite-prep/final_regression.py'
python='/private/tmp/sdk-r26-r22-311-env/bin/python'
pins='/private/tmp/sdk-r26-r22-byte-correspondence.json'
results=[]
for method in ('read','page','stream','async-read','async-page','async-stream'):
 out=Path('/private/tmp/sdk-r26-public-rewrite-'+method+'-r1')
 with Path(str(out)+'.log').open('w') as log:
  p=subprocess.run([python,'-I','-B',h,str(out),method,pins],stdout=log,stderr=subprocess.STDOUT,timeout=45)
 results.append({'method':method,'exit':p.returncode,'output':str(out)})
 Path('/private/tmp/sdk-r26-public-rewrite-summary.json').write_text(json.dumps(results,indent=2)+'\n')
 if p.returncode: raise SystemExit(p.returncode)
print(json.dumps(results))

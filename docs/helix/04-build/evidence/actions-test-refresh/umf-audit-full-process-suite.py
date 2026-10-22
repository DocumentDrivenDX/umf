import hashlib,json,re,subprocess,sys
from pathlib import Path
log=Path(sys.argv[1]);text=log.read_text();rows=[]
for line in text.splitlines():
 try: row=json.loads(line)
 except (ValueError,TypeError): continue
 if isinstance(row,dict) and 'testProcess' in row and 'exitCode' in row: rows.append(row)
expected=sorted(p for p in subprocess.check_output(['rg','--files','tests'],text=True).splitlines() if p.endswith('.test.ts'))
assert [r['testProcess'] for r in rows]==expected,'Missing, duplicate or reordered full-suite files'
assert all(r['exitCode']==0 and r['completeSummary'] is True and r['fail']==0 for r in rows),'Failed or incomplete file'
summary=list(re.finditer(r'\n\s*(\d+) pass\n\s*(\d+) fail\n\s*(\d+) expect\(\) calls\nRan (\d+) tests across (\d+) files\.',text))[-1]
passed,failed,assertions,total,files=map(int,summary.groups())
assert passed==total==sum(r['pass'] for r in rows) and failed==0
assert assertions==sum(r['assertions'] for r in rows) and files==len(expected)
print(json.dumps({'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'tests':total,'files':files,'assertions':assertions,'failures':failed,'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),'scope':'Every live .test.ts file; exact inventory, one successful process summary per file and matching aggregate counts'},indent=2))

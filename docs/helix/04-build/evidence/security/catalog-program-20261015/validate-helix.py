import json,os,pathlib,subprocess
r=pathlib.Path('/Users/erik/.codex/worktrees/security-main-integration/umf');out=r/'docs/helix/04-build/evidence/security/catalog-program-20261015';rows=[]
script='/Users/erik/.codex/plugins/cache/helix/helix/0.17.0/skills/helix/scripts/validate-instance.py';catalog='/Users/erik/.codex/plugins/cache/helix/helix/0.17.0/workflows'
for p in ['docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/02-design/technical-designs/TD-079-security-semantics.md','docs/helix/03-test/test-plans/STP-079-security-semantics.md','docs/helix/04-build/security-field-protection-plan.md','docs/helix/04-build/implementation-plan.md']:
 c=subprocess.run(['/opt/homebrew/bin/python3.14',script,p,'--catalog',catalog,'--format','json'],cwd=r,env={**os.environ,'PYTHONPATH':'/private/tmp/helix-verification-uv-cache/archive-v0/kgZKKUWfns5cxuWE'},text=True,capture_output=True)
 rows.append({'path':p,'exit':c.returncode,'stdout':c.stdout,'stderr':c.stderr});d=json.loads(c.stdout)
 if p.endswith('/implementation-plan.md'):
  old=json.loads((r/'docs/helix/04-build/evidence/security/protection-disclosure-20261015/helix-validation.json').read_text())[-1];baseline=json.loads(old['stdout']);assert d['summary']==baseline['summary'];assert [(x['severity'],x['check'],x['message']) for x in d['findings']]==[(x['severity'],x['check'],x['message']) for x in baseline['findings']]
 else:assert c.returncode==0,(p,c.stdout,c.stderr)
(out/'helix-validation.json').write_text(json.dumps(rows,indent=2)+'\n');print('four security artifacts pass; global two-blocker/twelve-warning baseline unchanged')

from pathlib import Path
import hashlib,json
p=Path('/Users/erik/.codex/worktrees/security-action-source-custody/umf/tools/security/protection-preparation-sources.ts')
b=p.read_bytes();s=b.decode();a=s.index('export interface PreparationFieldRef ');z=s.index('export const PREPARATION_COMPILER_PROFILE=',a)
# Human-reviewed inserted region contains only the three named TypeScript interfaces.
s=s[:a]+s[z:]
s=s.replace('compilePreparationSourceObligations(input:PreparationSourceInputs):PreparationSourceObligations{','compilePreparationSourceObligations(input:PreparationSourceInputs){')
s=s.replace(" const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());\n const input=readJsonValue(text,'json') as unknown as PreparationSourceInputs;"," const input=readJsonValue(await file.text(),'json') as unknown as PreparationSourceInputs;")
h=hashlib.sha256(s.encode()).hexdigest();expected='26ae5207df23d9411be1b5e2035093740cb388332090688d060f65b7064cf22c'
assert h==expected
print(json.dumps({'passed':True,'currentSourceSha256':hashlib.sha256(b).hexdigest(),'reconstructedPriorSourceSha256':h,'priorReviewedSourceSha256':expected,'changes':['Three named TypeScript interfaces and explicit return type','CLI reads original bytes and fatal UTF8 decoding with ignoreBOM=true instead of replacement-decoding file.text']},indent=2))

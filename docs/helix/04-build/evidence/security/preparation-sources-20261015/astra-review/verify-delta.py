from pathlib import Path
import hashlib,json
root=Path('/Users/erik/.codex/worktrees/security-action-source-custody/umf');p=root/'tools/security/protection-preparation-sources.ts';b=p.read_bytes();s=b.decode()
s=s.replace('binding:PreparationSourceArtifact;bindingEnvelope:PreparationSourceArtifact;loweringInvocation:PreparationSourceArtifact;','binding:PreparationSourceArtifact;loweringInvocation:PreparationSourceArtifact;')
s=s.replace("'compileResponse','binding','bindingEnvelope','loweringInvocation'","'compileResponse','binding','loweringInvocation'")
s=s.replace(" if(!same(read(packet.bindingEnvelope),packet.binding))fail('original raw binding Artifact envelope correspondence');\n",'')
h=hashlib.sha256(s.encode()).hexdigest();expected='156805f5bd7cda7928f5ca4c5811fd491c4e5c9d9c89bbd3bad5f491b17b434c';assert h==expected
fixture=root/'tests/security/preparation-sources-fixture.ts';fb=fixture.read_bytes();fs=fb.decode().replace(" const bindingEnvelope=raw('program-binding.json');\n",'').replace('binding:JSON.parse(bindingEnvelope.utf8),bindingEnvelope,',"binding:JSON.parse(raw('program-binding.json').utf8),")
fh=hashlib.sha256(fs.encode()).hexdigest();assert fh=='51e8369da78c88c68d625e764d291121109a4e13d89be02d4dd27048ddbd4cae'
print(json.dumps({'passed':True,'currentSourceSha256':hashlib.sha256(b).hexdigest(),'reconstructedPriorSourceSha256':h,'priorReviewedSourceSha256':expected,'currentFixtureSha256':hashlib.sha256(fb).hexdigest(),'reconstructedPriorFixtureSha256':fh,'changes':['Required raw bindingEnvelope Artifact retained in original packet','Original Artifact reader validates envelope; parsed binding must equal supplied contained binding Artifact','Fixture reads and retains original program-binding.json wrapper bytes']},indent=2))

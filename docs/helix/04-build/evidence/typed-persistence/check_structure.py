from pathlib import Path
import subprocess,re,json,hashlib
root=Path(__file__).resolve().parents[5]
tracked=subprocess.check_output(['git','diff','--name-only'],cwd=root,text=True).splitlines()
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines()
paths=[root/p for p in tracked+new if p.startswith('docs/helix/') and p.endswith('.md')]
newpaths=[root/p for p in new if p.startswith('docs/helix/') and p.endswith('.md')]
errors=[]; ids={}; newids={}; acs={}; count=0
for p in (root/'docs/helix').rglob('*.md'):
 if '/evidence/' in str(p) or '/spikes/' in str(p): continue
 m=re.match(r'---\n(.*?)\n---',p.read_text(),re.S)
 if m:
  i=re.search(r'^  id: (.+)$',m[1],re.M)
  if i: ids.setdefault(i[1],[]).append(p)
required={'feature-specification':['Problem Statement','Requirements','Edge Cases and Error Handling','Success Metrics','Constraints and Assumptions','Out of Scope'],'user-stories':['Story','Context','Walkthrough','Acceptance Criteria','Edge Cases','Test Scenarios','Dependencies'],'adr':['Problem','Decision','Why We Chose This','Consequences'],'contract':['Purpose','Scope and Boundaries','Normative Surface','Precedence and Compatibility','Error Semantics','Examples'],'solution-design':['Scope','Requirements Mapping','Solution Approaches','Domain Model','System Decomposition','Traceability','Concern Alignment','Constraints & Assumptions','Risks'],'technical-design':['Technical Approach','Component Changes','Testing','Security','Migration & Rollback'],'story-test-plan':['Story Reference','Scope and Objective','Acceptance Criteria Test Mapping','Executable Proof','Data and Setup','Build Handoff'],'implementation-plan':['Scope','Implementation Slices','Execution Contract','Continuation Evidence','Exit Criteria','Validation Plan','Risks and Rollbacks']}
for p in newpaths:
 text=p.read_text(); fm=re.match(r'---\n(.*?)\n---',text,re.S)
 if not fm: errors.append(str(p)+' missing frontmatter'); continue
 id=re.search(r'^  id: (.+)$',fm[1],re.M).group(1); newids[id]=p
 if len(ids.get(id,[]))!=1: errors.append(id+' duplicate ID')
 typ=re.search(r'^  type: (.+)$',fm[1],re.M).group(1)
 for heading in required.get(typ,[]):
  if not re.search(r'^## '+re.escape(heading)+r'\s*$',text,re.M): errors.append(id+' missing section '+heading)
 if typ=='user-stories':
  a=re.findall(r'^- \[ \] \*\*(US-\d+-AC\d+)\*\*',text,re.M); acs[id]=a
  if not a: errors.append(id+' has no ACs')
 for linked in re.findall(r'^    - id: (.+)$',fm[1],re.M):
  if linked not in ids: errors.append(id+' unresolved ddx link '+linked)
for p in paths:
 text=p.read_text()
 for target in re.findall(r'(?<!!)\[[^\]]*\]\(([^)]+)\)',text):
  if re.match(r'^[a-z][a-z+.-]*:',target) or target.startswith('#'): continue
  target=target.split('#')[0]
  if target and not (p.parent/target).resolve().exists():
   if p in newpaths or target in ['04-build/typed-persistence-design.md','typed-persistence-design.md']: errors.append(str(p.relative_to(root))+' broken local link '+target)
for us,a in acs.items():
 n=us.split('-')[1]
 td=next((root/'docs/helix/02-design/technical-designs').glob('TD-'+n+'-*.md')).read_text()
 stp=next((root/'docs/helix/03-test/test-plans').glob('STP-'+n+'-*.md')).read_text()
 for ac in a:
  count+=1
  if ac not in td or '@covers '+ac not in stp: errors.append(ac+' incomplete TD/STP trace')
for name in tracked:
 p=root/name
 if not name.endswith('.md'):continue
 before=subprocess.check_output(['git','show','HEAD:'+name],cwd=root,text=True)
 a=re.match(r'---\n.*?\n---',before,re.S); b=re.match(r'---\n.*?\n---',p.read_text(),re.S)
 if a and (not b or a[0]!=b[0]): errors.append(name+' changed existing frontmatter')
report={'kind':'scoped-design-structure','status':'pass' if not errors else 'fail','newArtifacts':len(newpaths),'modifiedDocuments':len(tracked),'newArtifactIds':sorted(newids),'acceptanceCriteria':count,'checks':['new ID uniqueness outside historical evidence/spikes','required sections','new ddx link resolution','new local Markdown links','all ACs referenced by TD and cited in STP','existing frontmatter byte-equivalent'],'errors':errors,'limitations':['Text/structure checks do not establish semantic correctness, implementation, native acceptance or actual test coverage.','Existing unrelated documentation inconsistencies excluded.']}
print(json.dumps(report,indent=2))
(Path(__file__).parent/'structure-check.json').write_text(json.dumps(report,indent=2)+'\n')
raise SystemExit(bool(errors))

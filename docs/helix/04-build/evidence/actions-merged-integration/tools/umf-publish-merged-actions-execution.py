from pathlib import Path
import sys,json,hashlib,shutil,subprocess,datetime
F=Path(sys.argv[1]).resolve();R=Path('/Users/erik/.codex/worktrees/actions-requirements-design/umf');D=Path('/private/tmp')/(F.name+'-execution');audit_tool=Path('/private/tmp/umf-audit-merged-actions-execution.py');subprocess.run([sys.executable,str(audit_tool),str(F)],check=True);A=json.loads((D/'audit.json').read_text());V=json.loads((D/'observation.json').read_text());N=json.loads((D/'negative-controls/report.json').read_text());assert A['pass'] and V['complete'] and N['pass'] and len(N['controls'])==7 and all(c['refused'] for c in N['controls'])
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert N['auditSha256']==sha(audit_tool)
expected_controls={'omitted-source-input','forged-source-input','failed-prerequisite','repeated-semantic-selection','noop-csv-command','omitted-output','forged-inherited-fixture'}
assert len(N['controls'])==len(expected_controls) and {c['control'] for c in N['controls']}==expected_controls
for control in N['controls']:
 assert control['refused'] and control['exitCode']!=0
 assert sha(Path(control['input']))==control['inputSha256'] and sha(Path(control['log']))==control['logSha256']
 assert 'AssertionError' in Path(control['log']).read_text()
assert sha(D/'observation.json')==A['executionObservation']['sha256'];assert A['mergedSourceRevision']==V['sourceRevision'];assert sha(Path(V['coordinator']['path']))==V['coordinator']['sha256']
for p,h in V['sourceInputs'].items():assert sha(F/p)==h and sha(R/p)==h,p
E=R/'docs/helix/04-build/evidence/actions-merged-integration';E.mkdir(exist_ok=False);(E/'.gitattributes').write_text('* -text\n');retained={};relocations={};source_refs={}
def retain(p,name):
 target=E/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target);assert sha(p)==sha(target);relative=str(target.relative_to(R));retained[relative]=sha(target);relocations[str(p)]=relative
 if p.is_relative_to(F):relocations[str(p.relative_to(F))]=relative
for name in ['audit.json','observation.json']:retain(D/name,name)
failed_root=Path('/private/tmp/umf-merged-actions-qualification-1fa21f6e-execution');failed=json.loads((failed_root/'disposition.json').read_text())
for name,h in failed['sha256'].items():assert sha(failed_root/name)==h
for p in sorted(failed_root.iterdir()):
 if p.is_file():retain(p,'failed-harness-attempt/'+p.name)
failed_report_root=Path('/private/tmp/umf-merged-actions-qualification-1fa21f6e-r1-execution');failed_report=json.loads((failed_report_root/'disposition.json').read_text())
for name,h in failed_report['sha256'].items():assert sha(failed_report_root/name)==h
for p in sorted(failed_report_root.iterdir()):
 if p.is_file():retain(p,'failed-generated-report-attempt/'+p.name)
for p in [Path(__file__),Path(V['coordinator']['path']),Path(V['semanticGenerator']['path']),Path('/private/tmp/umf-audit-merged-actions-execution.py'),Path('/private/tmp/umf-merged-audit-negative-controls.py'),Path('/private/tmp/umf-reviewed-main-delta-1d1f5eb2.json')]:retain(p,'tools/'+p.name)
for row in V['runs']:assert row['exitCode']==0 and sha(Path(row['log']))==row['logSha256'];retain(Path(row['log']),'logs/'+Path(row['log']).name)
for p in sorted((D/'negative-controls').iterdir()):
 if p.is_file():retain(p,'negative-controls/'+p.name)
for p,h in V['runs'][-1]['stageProofOutputs'].items():assert sha(F/p)==h;retain(F/p,'artifacts/'+p)
for p,h in V['runs'][-1]['generatedOutputs'].items():
 assert sha(F/p)==h
 if V['sourceInputs'].get(p)==h:source_refs[p]={'gitRevision':V['sourceRevision'],'path':p,'sha256':h}
 else:retain(F/p,'artifacts/'+p)
for path,digest in V['runs'][-1]['generatedOutputs'].items():
 target=R/path;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(F/path,target);assert sha(target)==digest,path
for path,digest in V['sourceInputs'].items():assert sha(R/path)==digest,path
for p in ['fixtures/json-schema-audit.json','fixtures/extension-package-audit.json','fixtures/actions/reference-foundation.json','fixtures/actions/browser.json']:
 retain(F/p,'artifacts/'+p);shutil.copy2(F/p,R/p);assert sha(R/p)==sha(F/p)
retain(Path('/private/tmp/umf-public-tlc-runtime-cold-check.log'),'tool-preparation/public-tlc-runtime-cold-check.log')
inventory={'profile':'umf.actions.merged-retained-artifacts/1','sourceRevision':V['sourceRevision'],'sha256':retained,'proofPathRelocations':relocations,'unchangedGeneratedSourceArtifacts':source_refs,'scope':'Original absolute paths retain execution identity; mapped artifacts preserve equal bytes. Git references bind unchanged served assets at the frozen source commit.'}
(E/'retained-artifacts.json').write_text(json.dumps(inventory,indent=2)+'\n')
B=A['baselineCertificate'];archive='docs/helix/04-build/evidence/actions-documentation/qualification-integrated-5be80ab9/actions-integrated-certification.json';assert sha(R/archive)==B['sha256']
certificate={'profile':'umf.actions.merged-integration-certificate/1','status':'certified for the stated bounded merged action acceptance profile','certified':True,'certifiedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':{'core':'0.8.0','extension':{'id':'umf.actions','version':'0.1.0'},'contracts':['CONTRACT-900','CONTRACT-901'],'stories':['US-900','US-056'],'qualification':A['scope'],'excluded':['Universal correctness or production/downstream adoption','Arbitrary handlers, administrator-added triggers or outside writers','External effects, workflows or cross-store transactions','Fresh execution of the entire 174-command native matrix or exact-current strict core admission']},'source':{'revision':V['sourceRevision'],'capturedMergedInputCount':len(V['sourceInputs']),'capturedInputInventory':'docs/helix/04-build/evidence/actions-merged-integration/observation.json'},'baselineQualification':{**B,'archivedCertificatePath':archive,'meaning':'Completed strict native/browser and admission baseline; exact immutable proof Git commit. Not fresh merged-source execution.'},'audit':A,'requiredPendingCertificationGates':[],'negativeControls':N,'retainedInventory':{'path':str((E/'retained-artifacts.json').relative_to(R)),'sha256':sha(E/'retained-artifacts.json')},'evidenceArtifacts':retained,'delivery':{'scope':'Merge, deployed website and release are separately verified delivery steps; this certificate qualifies execution only','readerUsabilitySessions':'Two beginner sessions remain follow-up; actual commit, rollback, refusal, replay and query visibility demonstrations passed'}}
subprocess.run([sys.executable,str(audit_tool),str(F)],check=True);assert json.loads((D/'audit.json').read_text())==A,'audit changed during proof transfer'
for path,digest in retained.items():assert sha(R/path)==digest,path
C=R/'docs/helix/04-build/evidence/actions-integrated-certification.json';C.write_text(json.dumps(certificate,indent=2)+'\n');results=A['freshMergedResults']
(R/'docs/helix/04-build/evidence/actions-integrated-certification.md').write_text(f"""# Merged action acceptance certificate

Certified for the stated bounded core 0.8.0 / actions 0.1.0 profile on frozen source `{V['sourceRevision']}`. Active governed identities are CONTRACT-900/901 and US-900/056. All 21 acceptance criteria have cited witnesses in freshly executed passing files.

Fresh merged verification includes {results['distinctBehaviorTests']} distinct behavior tests in {results['distinctBehaviorFiles']} files, eight separately counted semantic checks, 119 PostgreSQL reference tests, 44 public browser cases, schema/type/build checks, 43 Python tests, actual native tutorial observations, inert metadata controls, CSV controls, five affected browser integrations, and 22 SMT / 13 TLC bounded-model outcomes. All required stages pass. The 216 native histories and 648 transitions have zero mismatches; all five actual implementation mutations are detected. Seven copied-record negative controls confirm the integration audit rejects missing/forged inputs and invalid execution claims.

The [immutable baseline](actions-documentation/qualification-integrated-5be80ab9/README.md) separately records all 174 native/browser commands and 17 strict admission tests at source `5be80ab9e71d2da9aea589e688fdc61af0a0e251`. Their complete proof Git commit is `{B['fullProofCommit']}`. They are inherited baseline evidence, not fresh merged-source executions or manufactured currentEvidenceVerified/idealAdmitted flags.

The [machine-readable certificate](actions-integrated-certification.json), [independent audit](actions-merged-integration/audit.json), [closed execution observation](actions-merged-integration/observation.json) and [retained inventory](actions-merged-integration/retained-artifacts.json) bind source, actual commands, runtime observations, raw logs, generated bytes and proof relocations. The fresh generated Protobuf report is retained separately; whole-report comparison permits only the two exact unsupported Edition 2024 diagnostic filenames before verified baseline bytes are restored. This is observation handling, not broader Protobuf support or byte-identical fresh evidence. The native qualifier buffers child streams; its digest is not independently verified. Separate fresh regression logs retain actual native test output.

This does not certify universal correctness, production adoption, arbitrary handlers, outside writers, external effects or cross-store transactions. Merge, website deployment and release remain separately verified delivery operations. The actual tutorial proves commit, SQL failure rollback, durable refusal/replay, query visibility and revoked-replay denial. Two beginner reader sessions remain follow-up.
""")
paths=list(retained)
for offset in range(0,len(paths),100):
 subprocess.run(['git','add','-f','--',*paths[offset:offset+100]],cwd=R,check=True)
 subprocess.run(['git','add','--renormalize','-f','--',*paths[offset:offset+100]],cwd=R,check=True)
for path,digest in retained.items():assert hashlib.sha256(subprocess.check_output(['git','show',':'+path],cwd=R)).hexdigest()==digest,path
print(json.dumps({'published':True,'sourceRevision':V['sourceRevision'],'certificateSha256':sha(C),'retainedArtifacts':len(retained),'unchangedSourceReferences':len(source_refs)}))

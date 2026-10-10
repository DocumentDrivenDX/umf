"""Current-source owner Rust security admission evidence, not backend acceptance."""
import hashlib,json,os,subprocess
from pathlib import Path
ROOT=Path('/Users/erik/Projects/weft')
TOOL=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
env={**os.environ,'PATH':str(TOOL)+os.pathsep+os.environ.get('PATH',''),'CARGO_HOME':'/private/tmp/weft-toolchain/cargo'}
paths=[ROOT/'Cargo.toml',ROOT/'Cargo.lock',ROOT/'crates/weft-core/Cargo.toml',ROOT/'crates/weft-core/tests/security_admission.rs',ROOT/'crates/weft-core/tests/security_literals.rs',ROOT/'crates/weft-core/tests/security-source-fixture.json',ROOT/'crates/weft-core/tests/security-composition-oracle.json',Path('tools/security/weft-composition-oracle.ts'),Path('src/extensions/security/logic.ts'),ROOT/'crates/weft-core/tests/security-evaluation-oracle.json',Path('tools/security/weft-evaluation-oracle.ts'),Path('src/extensions/security/evaluate.ts'),Path('tests/security/evaluation-fixture.ts'),Path('tests/security/fixture.ts'),ROOT/'docs/helix/01-frame/prd.md',ROOT/'docs/helix/02-design/contracts/CONTRACT-005-security-compilation.md',Path(__file__)]
paths+=sorted(p for base in ['crates/weft-core/src','spec/upstream','docs/helix/02-design/contracts'] for p in (ROOT/base).rglob('*') if p.is_file() and p.suffix in ['.rs','.json'])
paths+=sorted(Path('src').rglob('*.ts'))
paths+=[Path('docs/helix/02-design/spikes/security/'+name+'-v0.2.schema.json') for name in ['policy','ontology']]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
sources={str(p):digest(p) for p in paths}
commands=[['bun',str(Path('tools/security/weft-evaluation-oracle.ts').resolve())],['bun',str(Path('tools/security/weft-composition-oracle.ts').resolve())],[str(TOOL/'cargo'),'test','--offline','--locked','-p','weft-core','--lib','--test','security_admission','--test','security_literals','--test','frontend','--test','compile-envelope','--target-dir','/private/tmp/umf-security-weft-bridge-target']]
commands.append([str(TOOL/'cargo'),'test','--offline','--locked','-p','weft-core','--doc','--target-dir','/private/tmp/umf-security-weft-bridge-target'])
runs=[]
for command in commands:
 r=subprocess.run(command,cwd=ROOT,env=env,text=True,capture_output=True,timeout=300)
 runs.append({'command':command,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 if r.returncode:break
fresh=all(digest(Path(p))==value for p,value in sources.items())
canonical=Path('/Users/erik/.codex/worktrees/1598/umf/spec/core/schema-properties-document.schema.json')
match=digest(canonical)==digest(ROOT/'spec/upstream/umf-0.8.0.schema.json')
def strict(value):
 if isinstance(value,dict):
  result={k:strict(v) for k,v in value.items()}
  if 'properties' in result and result.get('type')=='object':result['additionalProperties']=False
  return result
 if isinstance(value,list):return [strict(v) for v in value]
 return value
for name,filename in [('security-policy','schema.json'),('security-ontology','ontology.schema.json')]:
 original=Path('/Users/erik/.codex/worktrees/1598/umf/spec/extensions/security')/filename
 sources[str(original)]=digest(original)
 raw=json.loads(original.read_text());overlay=strict(raw);overlay['$id']=raw['$id']+':weft-selected-source-overlay'
 match=match and json.loads((ROOT/'spec/upstream'/f'umf-{name}-0.1.0.schema.json').read_text())==raw and json.loads((ROOT/'spec/upstream'/f'umf-{name}-0.1.0-selected.schema.json').read_text())==overlay
match=match and (ROOT/'crates/weft-core/tests/security-source-fixture.json').read_bytes()==Path('tests/security/weft-source-fixture.json').read_bytes()
for name in ['policy','ontology']:
 original=Path('docs/helix/02-design/spikes/security')/(name+'-v0.2.schema.json')
 raw=json.loads(original.read_text());overlay=strict(raw);overlay['$id']=raw['$id']+':weft-selected-draft-source-overlay'
 match=match and json.loads((ROOT/'spec/upstream'/f'umf-security-{name}-0.2.0-draft.schema.json').read_text())==raw and json.loads((ROOT/'spec/upstream'/f'umf-security-{name}-0.2.0-draft-selected.schema.json').read_text())==overlay
match=match and (ROOT/'crates/weft-core/tests/security-composition-oracle.json').read_bytes()==Path('/private/tmp/umf-security-weft-composition-oracle.json').read_bytes()
match=match and (ROOT/'crates/weft-core/tests/security-evaluation-oracle.json').read_bytes()==Path('/private/tmp/umf-security-weft-evaluation-oracle.json').read_bytes()
receipt={'status':'passed' if fresh and match and all(r['exitCode']==0 for r in runs) else 'failed','sourceDigests':sources,'canonicalSchemaMatches':match,'runs':runs,'rustc':subprocess.check_output([str(TOOL/'rustc'),'--version'],text=True).strip(),'scope':'Security 0.1 source/snapshot custody, ontology closure, declared term types/scopes, exact scalar literals/refinements, correlated logical IR and plan reuse, scoped rule composition and TypeScript truth correspondence, bounded fact-dependent simulation and Project membership oracle, exact source-bound query profiles, actual SQL field/operator extraction, per-scan/action private-fact obligations with work/text bounds and unrelated-action refusal, immutable source-checked mapping handoff retaining resolved application plan and dependencies, canonical overlays and atomic unsupported activation plus owner frontend/compile-envelope regressions. Separately, draft security 0.2 shape validation, exact pin checks, original byte custody and selected common-entity/raw-member/directed-Relationship correspondence. This draft subset requires primitive singular Record fields and includes separately typed draft declared-term checking for intrinsic terms and qualified raw/graph witnesses. Separately typed draft IR retains correlated lexical slots, witness capabilities and directional/member endpoint carriers. Draft action dependencies retain ordered Keys, raw witness inventories, graph incidences and distinct stored/context channels without constant live reads. Original and draft plans share a pure effect/disclosure fold checked against independent supplied-truth vectors; graph supplied truths are not evaluated graph facts. Draft graph incidence values check qualified role/side/target/Key and exact scalar components with retained domains/source pins, separate input and aggregate normalized storage bounds, and no context-free equality. Source-bound complete endpoint bundles retain directional roles and aggregate payload limits. Separately, bounded same-bundle existential endpoint conjunction simulation follows caller-declared complete/incomplete coverage with 128 independent finite-oracle correspondences and later-source/comparison-exhaustion refusal. The original draft IR opaque graph interpreter additionally preserves nested lexical witness correlation with Boolean/endpoint/existential expressions and recursive unsupported-profile refusal, including empty quantifiers. A separate identity-aware entry point uses common-entity ordered logical Keys for intrinsic subject/resource identities, with retained domains/source custody and eager unused-binding validation. Source-bound common entity field facts add subject/resource scalar and typed constant evaluation with key coherence, qualified field inventories, recursive missing-field refusal and charged scalar copies. An independently source-bound context inventory keeps stored/context values separate for the same qualified field, with recursive missing-context refusal and eager unused-source checking. A separate raw Record witness projection retains its own row identity and maps complete ordered member fields to common endpoint identities, with compound-key/domain/source-reuse controls; A separately bounded mixed raw Record/opaque graph original IR simulation preserves outer Project correlation, raw own identity/fields and independent context. Eager population/source admission, recursive used-field checks, duplicate raw own-Key refusal and charged comparisons cover literal budget, later stale-source, invalid unused population and distinct own identity controls. A separate source-bound Record-backed graph witness and mixed evaluator preserve edge own identity/fields and incidence endpoint carriers, with same-edge active/membership, source/owner/duplicate refusal, three/four-byte literal comparison, nested distinct own identity and unused invalid population controls. Grouping remains caller supplied and unauthenticated. It does not prove full core-document semantic validity, general draft compiler refinement, authenticated facts or complete general draft policy evaluation, admitted query/scan obligations, public compiler activation or native enforcement. No security lowering, Python/browser or native backend acceptance'}
Path('docs/helix/04-build/evidence/security/weft-admission.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(runs),'canonicalSchemaMatches':match}))
raise SystemExit(0 if receipt['status']=='passed' else 1)

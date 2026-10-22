"""Scoped receipt/replay gate; it cannot promote original backend cases."""
import hashlib, json, re, sys
from pathlib import Path
import z3

ROOT = Path('/Users/erik/.codex/worktrees/1598/umf')
SELF = ROOT / 'tools/security/validate-source-demands.py'
EVIDENCE = ROOT / 'docs/helix/04-build/evidence/security'
if Path.cwd().resolve() != ROOT or Path(__file__).resolve() != SELF or len(sys.argv) != 1:
    raise RuntimeError('Unknown exact source-demand gate invocation')
def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def fresh(receipt, required):
    pins = receipt['sourceDigests']
    return required <= set(pins) and all(digest(p) == h for p, h in pins.items()) and receipt['sourcesUnchanged'] is True

rust_path = EVIDENCE / 'weft-source-demands.json'
proof_path = EVIDENCE / 'source-demands-formal.json'
inventory_module = ROOT / 'tools/security/source_demand_inputs.py'
frozen = {str(p): p.read_bytes() for p in [SELF, rust_path, proof_path, inventory_module]}
inventory_namespace = {'__file__': str(inventory_module), '__name__': 'source_demand_inputs_captured'}
exec(compile(frozen[str(inventory_module)], str(inventory_module), 'exec'), inventory_namespace)
selected_inputs = inventory_namespace['selected_inputs']; CONFIGS = inventory_namespace['CONFIGS']
selected_paths, selected_presence, selected_aliases = selected_inputs()
rust = json.loads(frozen[str(rust_path)]); proof = json.loads(frozen[str(proof_path)])
owner = Path('/Users/erik/Projects/weft')
common = {str(ROOT / 'docs/helix/02-design/spikes/security/source-demand-binding-v0.1.md'),
          str(owner / 'crates/weft-core/src/security_obligation_sources.rs'),
          str(owner / 'crates/weft-core/src/security_semantic_coverage.rs')}
checks = []
def check(name, ok): checks.append({'id': name, 'status': 'passed' if ok else 'failed'})
check('fresh-rust-source-build-inventory', fresh(rust, common | {str(ROOT / 'tools/security/weft-source-demands.py'),
    str(owner / 'crates/weft-core/tests/security-source-fixture.json'), str(owner / 'Cargo.lock')})
    and set(rust['sourceDigests']) == {str(p) for p in selected_paths}
    and set(rust['configPresence']) == {str(p) for p in CONFIGS}
    and all(type(value) is bool for value in rust['configPresence'].values())
    and rust['configPresence'] == selected_presence and rust['symlinkTargets'] == selected_aliases)
execution = rust['execution']
names = ['security_obligation_sources::tests::demand_retention_merges_edges_and_refuses_exact_bound_overrun',
         'security_semantic_coverage::tests::issued_source_demands_match_independent_complete_fixture_map_and_exact_budgets',
         'security_semantic_coverage::tests::issued_source_demands_accumulate_distinct_original_actions_on_one_field',
         'security_semantic_coverage::tests::issued_source_demands_keep_output_selfjoin_and_false_branch_ownership',
         'security_semantic_coverage::tests::issued_source_demands_preserve_disjoint_candidates_and_zero_edge_selection']
summaries = re.findall(r'^test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out; finished in [^\n]+$', execution['stdout'], re.MULTILINE)
check('actual-complete-core-and-five-controls', rust['status'] == 'private-source-demand-tests-passed'
    and type(rust['testCount']) is int and rust['testCount'] == 118
    and type(execution['exitCode']) is int and execution['exitCode'] == 0
    and execution['command'] == ['/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo', 'test', '--offline', '--locked', '-p', 'weft-core', '--lib', '--', '--nocapture']
    and execution['cwd'] == str(owner) and summaries == [('118', '0', '0', '0', '0')]
    and all(len(re.findall(r'^test ' + re.escape(name) + r' \.\.\. ok$', execution['stdout'], re.MULTILINE)) == 1 for name in names))
check('fresh-conditional-proof-inputs', fresh(proof, common | {str(ROOT / 'tools/security/prove-source-demands.py')}))
expected_laws = ['whole-capability-before-source-quantifier', 'different-scopes-may-use-different-complete-capabilities',
                 'original-use-needs-primary-original-and-application', 'equal-marginals-cannot-substitute-scoped-edges',
                 'source-correspondence-cannot-discharge-native-execution']
law_ok = proof['status'] == 'conditional-proof-passed' and [row['id'] for row in proof['cases']] == expected_laws
replays = []
for row in proof['cases']:
    for kind, expected in [('violation', 'unsat'), ('negativeControl', 'sat'), ('positivePopulation', 'sat')]:
        cell = row[kind]; ctx = z3.Context(); solver = z3.Solver(ctx=ctx)
        solver.set(timeout=10000); solver.from_string(cell['smt']); observed = str(solver.check())
        law_ok = law_ok and cell['result'] == expected and cell['replayResult'] == expected and observed == expected
        replays.append({'law': row['id'], 'kind': kind, 'smtSha256': hashlib.sha256(cell['smt'].encode()).hexdigest(), 'result': observed})
check('five-laws-fifteen-fresh-context-replays', law_ok and len(replays) == 15)
check('qualification-boundaries', all(r['nativeImplementationQualified'] is False and r['acceptanceCasesPromoted'] == [] for r in [rust, proof]))
current_paths, current_presence, current_aliases = selected_inputs()
if (current_paths != selected_paths or current_presence != selected_presence or current_aliases != selected_aliases
    or any(Path(p).read_bytes() != data for p, data in frozen.items())
    or not fresh(rust, common) or not fresh(proof, common)):
    raise RuntimeError('Selected inputs or captured receipts changed during validation')
receipt = {'checks': checks, 'formalReplays': replays, 'inputDigests': {p: hashlib.sha256(data).hexdigest() for p, data in frozen.items()},
           'nativeImplementationQualified': False, 'acceptanceCasesPromoted': [],
           'scope': 'Scoped retained command/output/source correspondence and fresh-context finite formula replay under trusted runners. No independent Rust rerun, source authentication, matcher completeness or native acceptance.'}
out = EVIDENCE / 'source-demands-validation.json'
if out.exists():
    previous = out.read_bytes(); archive = out.parent / 'archive'; archive.mkdir(exist_ok=True)
    (archive / ('source-demands-validation-' + hashlib.sha256(previous).hexdigest() + '.json')).write_bytes(previous)
out.write_text(json.dumps(receipt, indent=2) + '\n')
failed = [c for c in checks if c['status'] != 'passed']
print(json.dumps({'checks': len(checks), 'formulas': len(replays), 'failed': failed}))
raise SystemExit(1 if failed else 0)

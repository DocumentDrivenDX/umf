"""Finite independent rational oracle for candidate numeric constant lowering.

This does not prove arbitrary-token parsing, SQL/native execution, field/parameter
admission, or compiler refinement. It checks the 475 authored combinations below
using Python Fraction rather than the lowerer's coefficient-normalization algorithm.
Run from the UMF worktree with Bun available. Retains a source-bound JSON receipt.
"""
import hashlib
import json
import re
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

SELF=Path('tools/security/candidate-numeric-rational-oracle.py')
if Path(__file__).resolve()!=SELF.resolve():raise RuntimeError('Unknown numeric oracle source')
module = Path('/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition.ts')
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [SELF,module,Path('/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-endpoint.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts')]}
base = {'nullability': 'required', 'cardinality': 'one', 'allowedValues': None}
domains = [dict(base, scalarType='integer', facets={})]
domains += [dict(base, scalarType='integer', facets={'integerWidth': {'bits': bits, 'signed': signed}}) for bits in (1, 2, 8, 64) for signed in (False, True)]
domains += [dict(base, scalarType='decimal', facets={'precision': p, 'scale': s}) for p in (1, 2, 4) for s in range(p + 1)]
tokens = ['0', '-0', '0.000', '-0e999999999999999999999999999999999999', '1', '-1', '127', '128', '255', '256', '-128', '-129', '1.0', '1.01', '0.1', '0.01', '0.0001', '999.99', '1e2', '100e-2', '100e-3', '-12.30e1', '9007199254740993', '9223372036854775807', '-9223372036854775808']
cases = [{'domain': domain, 'token': token} for domain in domains for token in tokens]
assert len(cases) == 475
before = sources[str(module)]
js = '''const packet=JSON.parse(await Bun.stdin.text());
const {lowerCandidateSecurityCondition:lower}=await import(packet.module);
const field={documentId:"d",moduleId:"m",elementId:"x"};
console.log(JSON.stringify(packet.cases.map(c=>{
 const term={value:{constant:{field,domain:c.domain,literal:{[c.domain.scalarType==="decimal"?"decimalToken":"integerToken"]:c.token}}}};
 try{return {sql:lower({condition:{equal:[term,term]},scans:[]})};}
 catch(e){return {refusal:e instanceof Error?e.message:String(e)};}
})));'''
run = subprocess.run(['bun', '-e', js], input=json.dumps({'module': str(module), 'cases': cases}), capture_output=True, text=True, timeout=30)
if run.returncode:
    raise RuntimeError('Lowerer execution failed: ' + run.stderr)
outputs = json.loads(run.stdout)
assert len(outputs) == len(cases)
observations = []
for index, (case, output) in enumerate(zip(cases, outputs)):
    token = case['token']
    domain = case['domain']
    facets = domain['facets']
    # Zero is independently recognized before Fraction sees an enormous exponent.
    value = Fraction(0) if re.fullmatch(r'-?0(?:\.0+)?(?:e[+-]?[0-9]+)?', token) else Fraction(token)
    if domain['scalarType'] == 'integer':
        expected_accept = value.denominator == 1
        if 'integerWidth' in facets:
            width = facets['integerWidth']
            lower = -(1 << (width['bits'] - 1)) if width['signed'] else 0
            upper = (1 << (width['bits'] - 1)) if width['signed'] else (1 << width['bits'])
            expected_accept = expected_accept and lower <= value < upper
    else:
        coefficient = value * 10 ** facets['scale']
        expected_accept = coefficient.denominator == 1 and abs(coefficient) < 10 ** facets['precision']
    accepted = 'sql' in output
    exact_value = None
    if accepted:
        literals = re.findall(r"E'([^']*)'::pg_catalog.numeric", output['sql'])
        exact_value = len(literals) == 2 and all(Fraction(literal) == value for literal in literals)
    passed = accepted == expected_accept and (exact_value is True if accepted else output.get('refusal') == 'TRUSS_SECURITY_CANDIDATE_CONDITION_UNSUPPORTED')
    observations.append({'id': 'rational-' + str(index), 'domain': domain, 'token': token, 'expectedAccepted': expected_accept, 'observedAccepted': accepted, 'exactEmittedValue': exact_value, 'expectedRational': {'numerator': str(value.numerator), 'denominator': str(value.denominator)}, 'passed': passed})
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Captured oracle source changed')
receipt = {'status': 'passed' if all(row['passed'] for row in observations) else 'failed', 'sourceDigests':sources,'sourcesUnchanged':True,'nativeImplementationQualified':False,'covers':['US-056-AC2'], 'observations': observations, 'scope': '475 authored finite integer, width-constrained integer and decimal constant cases; independent Python Fraction acceptance and exact emitted numeric value comparison. No all-token theorem, native SQL execution, parameter/column admission, authenticated source custody or compiler refinement.'}
Path('docs/helix/04-build/evidence/security/candidate-numeric-rational-oracle.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'cases':len(observations)}))
if receipt['status'] != 'passed':
    raise SystemExit(1)

"""Independent native oracle; no UMF model/adapter implementation imported."""
import hashlib
import importlib.metadata
from collections import Counter
from decimal import Decimal
from fractions import Fraction
from pathlib import Path
import simplejson as json
from jsonschema import Draft202012Validator, validators, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

root=Path('fixtures/json-schema/upstream')
manifest=json.loads((root/'manifest.json').read_text())
for name,digest in manifest['sha256'].items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest, name
record_path=Path('fixtures/json-schema/upstream-results.json')
report=json.loads(record_path.read_text(),use_decimal=True)
assert report['sourceRevision']==manifest['revision']
records=report['records']
assert len(records)==manifest['rootCases']
assert len({(r['file'],r['index']) for r in records})==len(records)

def integer(checker, value):
    return not isinstance(value,bool) and (isinstance(value,int) or isinstance(value,Decimal) and value.is_finite() and value==value.to_integral_value())
def multiple_of(validator, divisor, instance, schema):
    if validator.is_type(instance,'number') and Fraction(instance) % Fraction(divisor):
        yield ValidationError('Not an exact multiple')
ExactValidator=validators.extend(Draft202012Validator,validators={'multipleOf':multiple_of},type_checker=Draft202012Validator.TYPE_CHECKER.redefine('integer',integer))
validation_keywords={'type','enum','const','multipleOf','maximum','exclusiveMaximum','minimum','exclusiveMinimum','maxLength','minLength','pattern','maxItems','minItems','uniqueItems','maxContains','minContains','maxProperties','minProperties','required','dependentRequired'}
def native_validator(schema):
    # A selected custom metaschema without validation vocabulary does not assert
    # its validation keywords. Do not silently use the default complete dialect.
    if isinstance(schema,dict):
        dialect=schema.get('$schema','')
        prefix='http://localhost:1234/'
        if dialect.startswith(prefix):
            candidate=root/'remotes'/dialect[len(prefix):]
            if candidate.is_file():
                meta=json.loads(candidate.read_text())
                vocabulary=meta.get('$vocabulary')
                if vocabulary is not None and 'https://json-schema.org/draft/2020-12/vocab/validation' not in vocabulary:
                    return validators.extend(ExactValidator,validators={name:(lambda *args: iter(())) for name in validation_keywords})
    return ExactValidator

results=[]
for record in records:
    original=json.loads((root/'draft2020-12'/record['file']).read_text(),use_decimal=True)[record['index']]
    source=original['schema']
    emitted=json.loads(record['nativeExport'],use_decimal=True)
    assert source==emitted, (record['file'],record['index'],'native semantic tree mismatch')
    def retrieve(uri):
        prefix='http://localhost:1234/'
        if not uri.startswith(prefix): raise ValueError('Network retrieval prohibited: '+uri)
        filename=(root/'remotes'/uri[len(prefix):]).resolve()
        if not filename.is_relative_to((root/'remotes').resolve()):raise ValueError('Escaping reference')
        return Resource.from_contents(json.loads(filename.read_text(),use_decimal=True),default_specification=DRAFT202012)
    registry=Registry(retrieve=retrieve)
    base=record['baseUri']
    before=native_validator(source)(source,registry=registry.with_resource(base,Resource.from_contents(source,default_specification=DRAFT202012)))
    after=native_validator(emitted)(emitted,registry=registry.with_resource(base,Resource.from_contents(emitted,default_specification=DRAFT202012)))
    result={'file':record['file'],'index':record['index'],'vectors':len(original['tests']),'outcome':'passed','mismatches':[]}
    for vector in original['tests']:
        try:
            a=before.is_valid(vector['data']); b=after.is_valid(vector['data'])
            if a!=vector['valid'] or b!=vector['valid']:
                result['mismatches'].append({'description':vector['description'],'expected':vector['valid'],'before':a,'after':b})
        except Exception as error:
            result['mismatches'].append({'description':vector['description'],'error':str(error)})
    if result['mismatches']: result['outcome']='failed'
    results.append(result)
output={'sourceRevision':manifest['revision'],'oracle':{'jsonschema':importlib.metadata.version('jsonschema'),'referencing':importlib.metadata.version('referencing'),'simplejson':importlib.metadata.version('simplejson'),'numericProfile':'Exact Decimal decoding; mathematical integer type check; Fraction multipleOf', 'dialectProfile':'Custom metaschema validation-vocabulary selection; Python regex limitations reported'},'cases':len(results),'vectors':sum(x['vectors'] for x in results),'outcomes':dict(Counter(x['outcome'] for x in results)),'records':results}
Path('fixtures/json-schema/python-oracle-results.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({k:v for k,v in output.items() if k!='records'},indent=2))
for item in results:
    if item['outcome']!='passed':print(item)
# Require an independently checked expected-vector result for every original
# case; record individual oracle failures instead of masking them as passes.
uncovered=[]
for result,record in zip(results,records,strict=True):
    if result['outcome']!='passed' and record.get('oracle')!='passed':
        uncovered.append({'file':result['file'],'index':result['index']})
coverage={'sourceRevision':manifest['revision'],'cases':len(results),'vectors':output['vectors'],'expectedVectorCoverage':len(results)-len(uncovered),'uncovered':uncovered,'scope':'All required root Draft 2020-12 files; optional/proposal files vendored but not executed', 'basis':'At least one independent native oracle agrees with upstream expected results before and after UMF round trip for each case. Individual oracle failures retained.'}
Path('fixtures/json-schema/coverage.json').write_text(json.dumps(coverage,indent=2)+'\n')
print(json.dumps(coverage,indent=2))
raise SystemExit(bool(uncovered))

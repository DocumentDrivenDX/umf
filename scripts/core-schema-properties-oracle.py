"""Independent Python Decimal oracle for the declared literal subset."""
import json, re, sys, hashlib
from decimal import Decimal
from pathlib import Path
p=Path('fixtures/validation/core-schema-properties-oracle-inputs.json')
data=json.loads(p.read_text()); observations=[]
syntax=re.compile(r'-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?')
for row in data['probes']:
 token=row['token']; accepted=False
 if syntax.fullmatch(token):
  value=Decimal(token)
  if row['domain']=='integer':
   accepted=value==value.to_integral_value() and -(2**63)<=value<=2**63-1
  else:
   parts=value.as_tuple(); digits=''.join(map(str,parts.digits)).lstrip('0')
   if not digits: accepted=True
   else:
    shift=parts.exponent+2
    if shift>=0: accepted=len(digits)+shift<=20
    else:
     cut=-shift; accepted=cut<=len(digits) and set(digits[len(digits)-cut:])<= {'0'} and len(digits)-cut<=20
 observations.append({**row,'pythonAccepted':accepted,'agrees':accepted==row['accepted']})
result={'scope':data['scope'],'python':sys.version.split()[0],'probes':len(observations),'agreed':sum(r['agrees'] for r in observations),'observations':observations,'inputSha256':hashlib.sha256(p.read_bytes()).hexdigest()}
Path('fixtures/validation/core-schema-properties-oracle.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='observations'}))
assert all(row['agrees'] for row in observations), [row for row in observations if not row['agrees']]

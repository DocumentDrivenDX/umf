"""Independent decimal-token check; does not claim live SQL Server validation."""
from decimal import Decimal
from pathlib import Path
import hashlib,json,sys
path=Path(sys.argv[1] if len(sys.argv)>1 else 'fixtures/sqlserver/integer-tokens.json')
data=json.loads(path.read_text())
checks=[]
for case in data['cases']:
    value=Decimal(case['replacement'])
    integral=value==value.to_integral_value()
    safe=abs(value)<=9007199254740991
    negative_zero=value.is_zero() and value.is_signed()
    assert not integral or not safe or negative_zero
    checks.append({'path':case['path'],'token':case['replacement'],'integral':integral,'safeRange':safe,'negativeZero':negative_zero})
path.with_name('integer-tokens-oracle.json').write_text(json.dumps({'fixtureSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'checks':checks,'scope':'Independent exact Decimal assessment of the interoperable integer profile; no live server operations.'},indent=2)+'\n')
print({'exactTokenChecks':len(checks)})

"""Independent standard-library token oracle; not generated/runtime acceptance."""
import json, re
from datetime import date, datetime, timezone
from pathlib import Path
root=Path.cwd()
cases=json.loads((root/'fixtures/access/golden-vectors/temporal-profile.json').read_text())['cases']
results=[]
for v in cases:
 try:
  token=v['token'];kind=v['kind']
  if kind=='date':
   if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',token):raise ValueError()
   d=date.fromisoformat(token);canonical=d.isoformat()
  else:
   m=re.fullmatch(r'([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}:[0-9]{2}:[0-9]{2})(?:\.([0-9]{1,6}))?(Z|[+-][0-9]{2}:[0-9]{2})?',token)
   if not m:raise ValueError()
   suffix=m.group(4)
   if kind=='instant' and (suffix is None or suffix=='-00:00'):raise ValueError()
   if kind=='local' and suffix is not None:raise ValueError()
   if suffix not in (None,'Z') and (int(suffix[1:3])>23 or int(suffix[4:6])>59):raise ValueError()
   hh,mm,ss=map(int,m.group(2).split(':'))
   if hh>23 or mm>59 or ss>59:raise ValueError()
   d=datetime.fromisoformat(token.replace('Z','+00:00'))
   if kind=='instant':d=d.astimezone(timezone.utc)
   canonical=f'{d.year:04}-{d.month:02}-{d.day:02}T{d.hour:02}:{d.minute:02}:{d.second:02}.{d.microsecond:06}'+('Z' if kind=='instant' else '')
  result=dict(id=v['id'],accept=True,canonicalText=canonical)
 except (ValueError,OverflowError):result=dict(id=v['id'],accept=False)
 assert result['accept']==v['accept'],v['id']
 if result['accept']:
  expected=v.get('expected',{})
  if 'canonicalText' in expected:assert result['canonicalText']==expected['canonicalText'],v['id']
 results.append(result)
print(json.dumps(dict(status='passed',cases=len(cases),scope='Independent Python stdlib token grammar/calendar/canonical output; not umf_access or generated model acceptance',results=results),indent=2))

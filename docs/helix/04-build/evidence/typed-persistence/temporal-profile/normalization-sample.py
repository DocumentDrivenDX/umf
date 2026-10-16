from pathlib import Path
import json
e=Path('docs/helix/04-build/evidence/typed-persistence/temporal-profile')
from datetime import datetime,timedelta,timezone
sample=[]
for y in [1,4,100,400,1582,1900,1969,1970,2000,2024,9999]:
 for month,day in [(1,1),(2,28),(3,1),(12,31)]:
  for offset in [-1439,-330,-1,0,1,345,1439]:
   local=datetime(y,month,day,12,34,56,123456,tzinfo=timezone(timedelta(minutes=offset)))
   suffix=('+' if offset>=0 else '-')+f'{abs(offset)//60:02}:{abs(offset)%60:02}'
   token=f'{y:04}-{month:02}-{day:02}T12:34:56.123456{suffix}'
   try:
    utc=local.astimezone(timezone.utc)
    canonical=f'{utc.year:04}-{utc.month:02}-{utc.day:02}T{utc.hour:02}:{utc.minute:02}:{utc.second:02}.123456Z'
    sample.append(dict(token=token,accept=True,canonicalText=canonical))
   except (OverflowError,ValueError):sample.append(dict(token=token,accept=False))
(e/'python-normalization-sample.json').write_text(json.dumps(sample,indent=2)+'\n')

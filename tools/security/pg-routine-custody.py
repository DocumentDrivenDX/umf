"""Private installer-observed routine equality; no authentication or dependency closure."""
import json
FIELDS=frozenset(['oid','owner','language','definer','volatility','signature','configuration','body','binary','acl'])
def snapshot(value):
 if type(value) is not dict or any(type(k) is not str for k in value):raise ValueError('Routine custody refused')
 if set(value)!=FIELDS:raise ValueError('Routine custody refused')
 # Input is decoded native JSON. No callbacks or caller-defined serialization.
 def plain(v):
  if type(v) is str or type(v) is int or type(v) is bool or v is None:return
  if type(v) is list:
   for x in v:plain(x)
   return
  if type(v) is dict:
   for k,x in v.items():
    if type(k) is not str:raise ValueError('Routine custody refused')
    plain(x)
   return
  raise ValueError('Routine custody refused')
 plain(value)
 raw=json.dumps(value,sort_keys=True,separators=(',',':'))
 if len(raw.encode())>65536:raise ValueError('Routine custody refused')
 return raw
class InstalledRoutine:
 __slots__=('_original',)
 def __init__(self,original):self._original=snapshot(original)
 def admit(self,current):
  if snapshot(current)!=self._original:raise ValueError('Routine custody refused')

"""Independent expected disclosed relational operations, not canonical rewrites."""
import hashlib,hmac
ACTORS={'umf_sec_alice':['RA','RAB'],'umf_sec_bob':['RAB','RB'],'umf_sec_outsider':[]}
IDS=['RA','RAB','RB','RD','RO']
TEXT={'RA':'alpha','RAB':'alpha','RB':'beta','RD':'private','RO':'ownerless'}
INTS={'RA':11,'RAB':12,'RB':21,'RD':-2,'RO':0}
TOKEN_CLEAR={'RA':"alpha'\\😀",'RAB':"alpha'\\😀",'RB':'βeta\nprivate','RD':'unassigned','RO':'ownerless'}
OPERATORS=['predicate','order','group','join','aggregate']
def values(kind,key,nulls=False):
 if kind=='generalize':out={id:str(3+((x-3)//10)*10) for id,x in INTS.items()}
 elif kind=='hash':out={id:hashlib.sha256(x.encode()).hexdigest() for id,x in TEXT.items()}
 elif kind=='token':out={id:hmac.new(key,x.encode(),hashlib.sha256).hexdigest() for id,x in TOKEN_CLEAR.items()}
 else:raise ValueError(kind)
 if nulls and kind!='token':out['RAB']=None
 return out
def result(kind,operator,actor,key,nulls=False):
 v=values(kind,key,nulls);ids=ACTORS[actor];target=values(kind,key)['RA']
 if operator=='predicate':return [id for id in ids if v[id] is not None and v[id]==target]
 if operator=='order':return sorted(ids,key=lambda id:(v[id] is None,int(v[id]) if kind=='generalize' and v[id] is not None else v[id] or '',id))
 if operator=='join':return [[a,b] for a in ids for b in ids if v[a] is not None and v[a]==v[b]]
 if operator=='aggregate':return len({v[id] for id in ids if v[id] is not None})
 if operator=='group':
  counts={}
  for id in ids:counts[v[id]]=counts.get(v[id],0)+1
  return [[value,counts[value]] for value in sorted(counts,key=lambda value:(value is None,value or ''))]
 raise ValueError(operator)

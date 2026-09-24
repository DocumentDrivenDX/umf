import json,math
from decimal import Decimal
def exact(text):return json.loads(text,parse_float=Decimal,parse_int=lambda s:Decimal(s) if s=='-0' else int(s))
def processor_input(text):
    def number(s):
        d=Decimal(s);f=float(s)
        return f if math.isfinite(f) and not (d.is_zero() and d.is_signed()) and d==Decimal(str(f)) else d
    return json.loads(text,parse_float=number,parse_int=lambda s:Decimal(s) if s=='-0' else int(s))
def equivalent(a,b,key='',literal=False):
    if isinstance(a,(int,float,Decimal)) and not isinstance(a,bool) and isinstance(b,(int,float,Decimal)) and not isinstance(b,bool):
        x,y=Decimal(str(a)),Decimal(str(b));return x==y and (not x.is_zero() or x.is_signed()==y.is_signed())
    if type(a)!=type(b):return False
    if isinstance(a,dict):return a.keys()==b.keys() and all(equivalent(a[k],b[k],k,literal or (k=='@value' and a.get('@type')=='@json')) for k in a)
    if isinstance(a,list):
        if len(a)!=len(b):return False
        if key=='@list' or literal:return all(equivalent(x,y,literal=literal) for x,y in zip(a,b))
        remaining=list(b)
        for x in a:
            for i,y in enumerate(remaining):
                if equivalent(x,y):remaining.pop(i);break
            else:return False
        return True
    if key=='@language' and not literal and isinstance(a,str):return a.lower()==b.lower()
    return a==b

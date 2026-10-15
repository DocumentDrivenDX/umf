"""Conditional integer-coefficient law; not a PostgreSQL implementation proof."""
import json,sys
from z3 import Int,If,Solver,unsat,sat,get_version_string
x,o,w=Int('x'),Int('origin'),Int('width');d=x-o
q0=If(d>=0,d/w,-((-d)/w));rem=d-q0*w
q=q0-If(rem<0,1,0);lower=o+q*w
checks=[]
for name,bad in [('lower-bound',lower>x),('upper-bound',x>=lower+w),('bucket-lattice-membership',(lower-o)%w!=0)]:
 s=Solver();s.add(w>0,bad);result=s.check();assert result==unsat
 checks.append(dict(law=name,result=str(result)))
s=Solver();s.add(w>0,o+q0*w>x);assert s.check()==sat
checks.append(dict(law='truncation-without-negative-remainder-correction',result='sat',witness=str(s.model())))
print(json.dumps(dict(scope='unbounded exact integer coefficients; positive width; no SQL engine or domain admission proof',z3=get_version_string(),checks=checks),indent=2))

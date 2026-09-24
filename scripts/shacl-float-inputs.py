import json
from decimal import Decimal,localcontext
from pathlib import Path
with localcontext() as ctx:
 ctx.prec=200
 tie=format(Decimal(2)**-150,'f');above=tie+'1'
pairs=[
 ['float-double','0.1','float','0.1','double',1],['double-float','0.1','double','0.1','float',-1],
 ['integer-float','16777217','integer','16777216','float',0],['integer-double','9007199254740993','integer','9007199254740992','double',0],
 ['even-tie','1.000000059604644775390625','decimal','1','float',0],['above-tie','1.0000000596046447753906250000000000000001','decimal','1','float',1],
 ['odd-tie','1.000000178813934326171875','decimal','1.00000011920928955078125','float',1],
 ['negative-above-tie','-1.0000000596046447753906250000000000000001','decimal','-1','float',-1],
 ['subnormal-tie',tie,'decimal','0','float',0],['subnormal-above',above,'decimal','0','float',1],
 ['float-underflow','1e-50','float','1e-50','double',-1],['double-underflow','1e-4000','double','0','integer',0],
 ['float-overflow','3.5e38','float','1e300','double',1],['decimal-overflow','350000000000000000000000000000000000000','decimal','INF','float',0],
 ['overflow-tie','340282356779733661637539395458142568448','decimal','INF','float',0],['below-overflow-tie','340282356779733661637539395458142568447','decimal','INF','float',-1],
 ['infinities','INF','double','INF','float',0],['negative-infinity','-INF','double','-999999999999999999999999','integer',-1],
 ['nan-left','NaN','float','1','integer',None],['nan-right','1','integer','NaN','double',None],['nan-both','NaN','float','NaN','double',None],
 ['signed-zero','-0','double','0','float',0],['huge-exponent','1e1000000000','float','INF','float',0],['tiny-exponent','1e-1000000000','float','0','float',0]]
Path('native/shacl/float-pairs.json').write_text(json.dumps(pairs,indent=2)+'\n');print({'pairs':len(pairs)})

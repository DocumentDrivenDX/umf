import ctypes,json,math,platform,locale
from pathlib import Path
locale.setlocale(locale.LC_NUMERIC,'C')
libc=ctypes.CDLL(None)
for name,restype in [('strtof',ctypes.c_float),('strtod',ctypes.c_double)]:
 fn=getattr(libc,name);fn.argtypes=[ctypes.c_char_p,ctypes.POINTER(ctypes.c_char_p)];fn.restype=restype
rows=[]
def parse(text,width):
 end=ctypes.c_char_p();value=getattr(libc,'strtof' if width==32 else 'strtod')(text.encode('ascii'),ctypes.byref(end));assert not end.value;return value
def display(x):return 'NaN' if math.isnan(x) else 'INF' if x==math.inf else '-INF' if x==-math.inf else x
for name,av,at,bv,bt,expected in json.loads(Path('native/shacl/float-pairs.json').read_text()):
 width=64 if 'double' in [at,bt] else 32
 a=parse(av,32 if at=='float' else 64 if at=='double' else width);b=parse(bv,32 if bt=='float' else 64 if bt=='double' else width)
 comparison=None if math.isnan(a) or math.isnan(b) else 0 if a==b else -1 if a<b else 1
 rows.append({'id':name,'a':display(a),'b':display(b),'comparison':comparison,'expected':expected,'equal':comparison==expected})
Path('fixtures/shacl/float-oracle.json').write_text(json.dumps({'oracle':'C strtof/strtod via Python ctypes; independent direct decimal-to-binary conversions','libc':platform.libc_ver(),'rounding':'process default, ties-to-even on this environment','results':rows},indent=2,allow_nan=False)+'\n');assert all(r['equal'] for r in rows);print({'pairs':len(rows),'equal':True,'libc':platform.libc_ver()})

"""Independent fixed actor facts and specification expectations for native P04 work."""
import hashlib,json
SOURCE_SHA256='d5b3756e5e068bc913381a667543750b26780310f167951b01265996e80752aa'
ACTORS={
 'umf_sec_mw_original':('original',True,True,False),
 'umf_sec_mw_masked':('masked',True,True,False),
 'umf_sec_mw_withheld':('withheld',True,True,False),
 'umf_sec_mw_blind_masked':('masked',True,True,True),
 'umf_sec_mw_blind_withheld':('withheld',True,True,True),
 'umf_sec_mw_blind_denied':('denied',True,True,True),
 'umf_sec_mw_no_object':('original',False,True,True),
 'umf_sec_mw_no_field':('original',True,False,True)}
OUTSIDER='umf_sec_mw_outsider'
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def admit_sources(v):return hashlib.sha256(canonical(v)).hexdigest()==SOURCE_SHA256
def subjects():return [dict(login=actor,readClass=c,normal=n,field=f,blind=b) for actor,(c,n,f,b) in ACTORS.items()]
def intent(actor):
 c,n,f,b=ACTORS[actor];return n and f and(c=='original' or b)
def logical(actor,before,proposed):
 c,n,f,b=ACTORS[actor];return 'permit' if n and(before==proposed or f and(c=='original' or b)) else 'deny'
def disclosed(actor,value):
 c=ACTORS[actor][0]
 if c=='denied':return []
 cell={'disposition':{'original':'original','masked':'transformed','withheld':'withheld'}[c]}
 if c!='withheld':cell['value']=None if c=='original' and value is None else {'integerToken':value if c=='original' else '0'}
 return [{'id':'r1','cell':cell}]
VECTORS=[dict(id=actor+':'+str(i),actor=actor,before=before,proposed=proposed) for actor in ACTORS for i,(before,proposed) in enumerate([('100','0'),('100','201'),('100','100'),('100',None),(None,None),(None,'0'),('100','9007199254740993'),('100','-9223372036854775808'),('100','9223372036854775807')])]

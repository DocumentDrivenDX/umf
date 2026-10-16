from pathlib import Path
from collections import Counter
import json,hashlib
out=Path('/private/tmp/umf-current-scalar-edge-20261015');out.mkdir(exist_ok=True)
values=['',' ','  ','\t','\n','\r','!','"',"'", "' OR TRUE --",'\\','%_','0','00','A','Z','a','a ','a  ','a\n','aa','z','é','e\u0301','Å','A\u030a','日本語','🙂','𐀀','\U0010ffff']
integers=[-(2**63),-(2**53)-1,-1,0,1,2**53+1,2**63-1]
rows=[{'id':f'r{i:03}','eligible':True,'salaryToken':str(integers[i%len(integers)]),'salaryPublic':'[private]','token':v} for i,v in enumerate(values)]
rows.extend([{'id':'repeat-a','eligible':True,'salaryToken':str(2**63-1),'salaryPublic':'[private]','token':'a'},{'id':'repeat-empty','eligible':True,'salaryToken':str(-(2**63)),'salaryPublic':'[private]','token':''},{'id':'ineligible','eligible':False,'salaryToken':str(-(2**63)),'salaryPublic':'[private]','token':'HIDDEN-SENTINEL'}])
eligible=[r for r in rows if r['eligible']];ordered=sorted(eligible,key=lambda r:r['token'].encode('utf-8'));counts=Counter(r['token'] for r in eligible)
cases=[]
def case(id,sql,expected,parameters=None,unordered=False):cases.append({'id':id,'sql':sql,'parameters':parameters or {},'expectedRows':expected,'unordered':unordered})
case('utf8-c-order-asc','SELECT r.token FROM Resource r ORDER BY r.token ASC',[[r['token']] for r in ordered])
case('utf8-c-order-desc','SELECT r.token FROM Resource r ORDER BY r.token DESC',[[r['token']] for r in reversed(ordered)])
case('utf8-c-group','SELECT r.token,COUNT(*) AS n FROM Resource r GROUP BY r.token ORDER BY r.token ASC',[[v,str(counts[v])] for v in sorted(counts,key=lambda v:v.encode('utf-8'))])
case('utf8-distinct-exact','SELECT COUNT(DISTINCT r.token) AS n FROM Resource r',[[str(len(counts))]])
case('eligible-bag-count','SELECT COUNT(*) AS n FROM Resource r',[[str(len(eligible))]])
case('utf8-inner-selfjoin-bag','SELECT COUNT(*) AS n FROM Resource r JOIN Resource s ON r.token=s.token',[[str(sum(n*n for n in counts.values()))]])
for name,token in [('min',str(-(2**63))),('max',str(2**63-1)),('beyond-js-safe',str(2**53+1))]:
 expected=[[r['id'],'[private]'] for r in eligible if r['salaryToken']==token]
 case('int64-'+name+'-parameter','SELECT r.resourceId,r.salary FROM Resource r WHERE r.salary=:salary',expected,{'salary':{'family':'integer','value':token}},True)
 case('int64-'+name+'-literal','SELECT r.resourceId,r.salary FROM Resource r WHERE r.salary='+token,expected,None,True)
for name,value in [('empty',''),('quote',"' OR TRUE --"),('non-normalized','e\u0301'),('linefeed','\n'),('max-codepoint','\U0010ffff')]:
 case('text-parameter-'+name,'SELECT r.token FROM Resource r WHERE r.token=:token',[[r['token']] for r in eligible if r['token']==value],{'token':{'family':'string','value':value}})
refusals=[]
for name,token in [('int64-positive-overflow',str(2**63)),('int64-negative-overflow',str(-(2**63)-1)),('integer-fractional','1.5')]:refusals.append({'id':name,'sql':'SELECT COUNT(*) AS n FROM Resource r WHERE r.salary=:salary LIMIT 0','parameters':{'salary':{'family':'integer','value':token}}})
refusals.append({'id':'text-nul-even-empty','sql':'SELECT COUNT(*) AS n FROM Resource r WHERE r.token=:token LIMIT 0','parameters':{'token':{'family':'string','value':'\0'}}})
data={'version':'umf.security.current-scalar-edge-oracle/0.1-candidate','scope':'Conditional typed SQL/value refinement over authored private staged rows only; no eligibility/mode/runtime/caller/issuer/authorization proof','oracle':'Independent Python UTF8 byte ordering, exact string equality and mathematical signed64/Counter expectations; no parsed/generated SQL used to compute expected rows','rows':rows,'cases':cases,'refusals':refusals}
(out/'oracle.json').write_text(json.dumps(data,ensure_ascii=True,indent=2)+'\n');print(json.dumps({'path':str(out/'oracle.json'),'positiveCases':len(cases),'refusalCases':len(refusals),'eligibleRows':len(eligible),'distinctTokens':len(counts)}))

import json,z3
B=z3.Bool; A=z3.And; N=z3.Not
field,member,allow,identity,required,typednull=B('field'),B('member'),B('allow'),B('identity'),B('required'),B('typednull')
checks=[]
def check(name,formula,want):
 s=z3.Solver();s.add(formula);r=str(s.check());assert r==want,(name,r);checks.append({'name':name,'result':r,'formula':str(formula),'model':str(s.model()) if r=='sat' else None})
# Abstraction of distinct domain, membership/context and identity judgments.
domain=field
live=A(domain,member)
context=A(domain,allow)
key=A(domain,required,N(typednull))
check('domain-only does not imply live ownership',A(domain,N(member),live),'unsat')
check('domain-only does not imply context allowance',A(domain,N(allow),context),'unsat')
check('nullable scalar domain is inhabitable by null',A(domain,N(required),typednull),'sat')
check('identity key excludes nullable declaration',A(key,N(required)),'unsat')
check('identity key excludes original null',A(key,typednull),'unsat')
check('weak all-fields-live rule admits DTO ownership',A(domain,N(member),domain),'sat')
same_handle,same_order,same_scope,copied=B('same_handle'),B('same_order'),B('same_scope'),B('copied')
admit=A(same_handle,same_order,same_scope,N(copied))
for name,violation in [('reordered',N(same_order)),('copied',copied),('foreign-scope',N(same_scope)),('unissued',N(same_handle))]:check('compact refuses '+name,A(admit,violation),'unsat')
check('weak issuance alone admits reordered table',A(same_handle,N(same_order)),'sat')
print(json.dumps({'scope':'Conditional Boolean judgment model only; no implementation refinement, resource bound, native authorization or full policy proof. Concrete tests and independent review separately bind implementation.','z3':z3.get_version_string(),'queries':checks},indent=2))

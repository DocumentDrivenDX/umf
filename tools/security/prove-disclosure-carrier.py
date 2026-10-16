"""Abstract disclosure carrier left-inverse and information-loss controls.
Not SQL/code correctness, native admission, policy authorization or P03 proof.
@covers US-056-AC6
"""
import argparse,hashlib,json,pathlib,z3
p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
F=z3.Datatype('QualifiedField');F.declare('field',('document',z3.StringSort()),('revision',z3.StringSort()),('module',z3.StringSort()),('element',z3.StringSort()));F=F.create()
T=z3.Datatype('Transform');T.declare('transform',('identity',z3.StringSort()),('version',z3.StringSort()));T=T.create()
S=z3.Datatype('Selection');S.declare('selection',('rule',z3.IntSort()),('disclosure',z3.IntSort()));S=S.create()
V=z3.Datatype('TypedValue');V.declare('Null');V.declare('Text',('text',z3.StringSort()));V.declare('Integer',('integer',z3.IntSort()));V=V.create()
C=z3.Datatype('Cell');C.declare('Original',('originalField',F),('originalValue',V));C.declare('Absent',('absentField',F));C.declare('Withheld',('withheldField',F));C.declare('Transformed',('transformedField',F),('selected',S),('outputDomain',F),('transformation',T),('transformedValue',V));C=C.create()
P=z3.Datatype('Payload');P.declare('MissingPayload');P.declare('PresentPayload',('value',V));P=P.create()
M=z3.Datatype('Metadata');M.declare('NoMetadata');M.declare('TransformationMetadata',('selection',S),('domain',F),('transform',T));M=M.create()
N=z3.Datatype('Native');N.declare('native',('tag',z3.IntSort()),('field',F),('payload',P),('metadata',M));N=N.create()
D=z3.Datatype('Decode');D.declare('Refused');D.declare('Decoded',('cell',C));D=D.create()
def field(c):return z3.If(C.is_Original(c),C.originalField(c),z3.If(C.is_Absent(c),C.absentField(c),z3.If(C.is_Withheld(c),C.withheldField(c),C.transformedField(c))))
def value(c):return z3.If(C.is_Original(c),C.originalValue(c),C.transformedValue(c))
def q(f):return z3.And(*[x(f)!=''for x in [F.document,F.revision,F.module,F.element]])
def meta_ok(m):return z3.And(M.is_TransformationMetadata(m),q(M.domain(m)),T.identity(M.transform(m))!='',T.version(M.transform(m))!='',S.rule(M.selection(m))>=0,S.rule(M.selection(m))<=9007199254740991,S.disclosure(M.selection(m))>=0,S.disclosure(M.selection(m))<=9007199254740991)
def valid(c):return z3.And(q(field(c)),z3.Implies(C.is_Transformed(c),meta_ok(M.TransformationMetadata(C.selected(c),C.outputDomain(c),C.transformation(c)))))
def encode(c):return N.native(z3.If(C.is_Original(c),0,z3.If(C.is_Absent(c),1,z3.If(C.is_Withheld(c),2,3))),field(c),z3.If(z3.Or(C.is_Original(c),C.is_Transformed(c)),P.PresentPayload(value(c)),P.MissingPayload),z3.If(C.is_Transformed(c),M.TransformationMetadata(C.selected(c),C.outputDomain(c),C.transformation(c)),M.NoMetadata))
def well(n):return z3.And(q(N.field(n)),z3.Or(z3.And(N.tag(n)==0,P.is_PresentPayload(N.payload(n)),M.is_NoMetadata(N.metadata(n))),z3.And(z3.Or(N.tag(n)==1,N.tag(n)==2),P.is_MissingPayload(N.payload(n)),M.is_NoMetadata(N.metadata(n))),z3.And(N.tag(n)==3,P.is_PresentPayload(N.payload(n)),meta_ok(N.metadata(n)))))
def decode(n):
 f=N.field(n);v=P.value(N.payload(n));m=N.metadata(n)
 return z3.If(well(n),D.Decoded(z3.If(N.tag(n)==0,C.Original(f,v),z3.If(N.tag(n)==1,C.Absent(f),z3.If(N.tag(n)==2,C.Withheld(f),C.Transformed(f,M.selection(m),M.domain(m),M.transform(m),v))))),D.Refused)
results=[]
def check(name,expected,*constraints):
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*constraints);source=solver.to_smt2();path=a.output/(name+'.smt2');path.write_text(source);actual=str(solver.check());assert actual==expected,(name,expected,actual)
 r={'id':name,'expected':expected,'actual':actual,'smt2Sha256':hashlib.sha256(source.encode()).hexdigest()}
 if actual=='sat':r['model']=str(solver.model())
 results.append(r)
c,d=z3.Consts('c d',C);n=z3.Const('n',N)
check('well-formed-cells-exist','sat',valid(c),C.is_Transformed(c))
for label,predicate in [('original',C.is_Original),('absent',C.is_Absent),('withheld',C.is_Withheld)]:check('well-formed-'+label+'-exists','sat',valid(c),predicate(c))
check('semantic-left-inverse-violation','unsat',valid(c),decode(encode(c))!=D.Decoded(c))
check('canonical-native-right-inverse-violation','unsat',well(n),encode(D.cell(decode(n)))!=n)
check('encoded-cell-collision','unsat',valid(c),valid(d),c!=d,encode(c)==encode(d))
check('malformed-native-accepted','unsat',z3.Not(well(n)),decode(n)!=D.Refused)
f=F.field(*map(z3.StringVal,['document','revision','module','field']));dom=F.field(*map(z3.StringVal,['document','revision','module','output']));sel=S.selection(0,0);tx=T.transform(z3.StringVal('mask'),z3.StringVal('1'))
original=C.Original(f,V.Null);absent=C.Absent(f);withheld=C.Withheld(f);transformed=C.Transformed(f,sel,dom,tx,V.Null)
def scalar_only(c):return z3.If(z3.Or(C.is_Original(c),C.is_Transformed(c)),value(c),V.Null)
for name,l,r in [('null-absence',original,absent),('absence-withheld',absent,withheld),('original-transformed-null',original,transformed)]:check('erase-disposition-'+name,'sat',valid(l),valid(r),l!=r,scalar_only(l)==scalar_only(r))
# Each weakened observation removes exactly one independent provenance component.
def weak(c,part):
 f=field(c);m=M.TransformationMetadata(C.selected(c),C.outputDomain(c),C.transformation(c))
 if part=='original-document':f=F.field(z3.StringVal('erased'),F.revision(f),F.module(f),F.element(f))
 if part=='original-revision':f=F.field(F.document(f),z3.StringVal('erased'),F.module(f),F.element(f))
 if part=='output-domain':m=M.TransformationMetadata(C.selected(c),dom,C.transformation(c))
 if part=='transform-version':m=M.TransformationMetadata(C.selected(c),C.outputDomain(c),T.transform(T.identity(C.transformation(c)),z3.StringVal('erased')))
 if part=='selection':m=M.TransformationMetadata(sel,C.outputDomain(c),C.transformation(c))
 return N.native(3,f,P.PresentPayload(C.transformedValue(c)),m)
for part in ['original-document','original-revision','output-domain','transform-version','selection']:
 check('erase-'+part,'sat',valid(c),valid(d),C.is_Transformed(c),C.is_Transformed(d),c!=d,weak(c,part)==weak(d,part))
report={'status':'passed','solver':z3.get_version_string(),'sourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'checks':results,'scope':'Encoding well-formedness is not UMF Field/domain/policy validity. Null/Text/Integer abstract-value subset only. Conditional algebra of qualified Field/revision, disposition, explicit payload presence and transformation provenance over abstract typed values. No authentication/source completeness, Unicode/native JSON/SQL encoding theorem, concrete decoder correctness, operator semantics, policy decisions or native P03 admission. Native empirical execution and public inspector checks are separate evidence.'}
(a.output/'formal.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'checks':len(results),'unsat':sum(r['actual']=='unsat'for r in results),'sat':sum(r['actual']=='sat'for r in results)}))

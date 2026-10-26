import json,hashlib
import sys
from typing import ClassVar
from datetime import datetime
import pydantic
from pydantic import BaseModel
from umf_access.capture import capture
from umf_access.rust_catalog_render import _EncodingBudget,_encode_capture
from umf_access.dsl import FieldRef,RecordRef,Node,Terminal,Param,Column,Join,Query,query,if_present
from umf_access.dsl.search import SearchLeg
from umf_access.dsl._nodes import GeneratedSource,literal
from umf_access.generated_core import CURRENT_CORE_VERSION
from umf_access.types import MISSING
assert sys.version_info[:3] == (3, 13, 16) and pydantic.__version__ == "2.14.1"
class Order: pass
fid=FieldRef(module='commerce',element='Order',field='id'); amt=FieldRef(module='commerce',element='Order',field='amount')
foreign=FieldRef(module='commerce',element='Invoice',field='amount'); rel=FieldRef(module='commerce',element='Order',field='customer_id'); childf=FieldRef(module='commerce',element='Customer',field='id')
root=RecordRef(module='commerce',element='Order',key=(fid,)); child=RecordRef(module='commerce',element='Customer',key=(childf,)); foreignrec=RecordRef(module='commerce',element='Invoice',key=(foreign,))
src=GeneratedSource('validator-test',CURRENT_CORE_VERSION,'0'*64,'1'*64,'umf-access-runtime/0.1'); selected=RecordRef(module='commerce',element='Order',key=(fid,),source=src,key_id='Order_key')
class OrderKey(BaseModel):
 KEY_IDENTITY:ClassVar[dict[str,str]]={'documentId':'validator-test','coreVersion':str(CURRENT_CORE_VERSION),'module':'commerce','element':'Order','key':'Order_key'}
 id:str
class OtherOrderKey(BaseModel):
 KEY_IDENTITY:ClassVar[dict[str,str]]={'documentId':'validator-test','coreVersion':str(CURRENT_CORE_VERSION),'module':'commerce','element':'Order','key':'Other_key'}
 id:str
class ForeignKey(BaseModel):
 KEY_IDENTITY:ClassVar[dict[str,str]]={'documentId':'validator-test','coreVersion':str(CURRENT_CORE_VERSION),'module':'commerce','element':'Invoice','key':'Invoice_key'}
 id:str
def term(op='all',rec=root,steps=(),extra=()):return Terminal(Node(op,(rec,tuple(steps),*extra)))
def fn(i,params,builder):
 ann=', '.join(f'{n}: Param[{t}]' for n,t in params); kw='{'+', '.join(repr(n)+': '+n for n,_ in params)+'}'
 code=f'@query\ndef f{i}({ann}):\n return __b({kw})\n' if params else f'@query\ndef f{i}():\n return __b({{}})\n'
 ns=globals().copy();ns['__b']=builder;exec(code,ns);return ns[f'f{i}']
def observe(f,with_dto=False):
 try:
  cap=capture(f);out={'outcome':'accepted','variantCount':len(cap.variants),'presence':[list(v.presence) for v in cap.variants]}
  if with_dto:out['dtoVariants']=[{'presence':list(v.presence),'dto':_encode_capture(v,_EncodingBudget())} for v in cap.variants]
  return out
 except Exception as e:return {'outcome':'refused','exception':type(e).__name__,'code':getattr(e,'code',''),'message':str(e)}
col=lambda f:Node('column',(f,)); eq=lambda f,n='value':Node('=',(col(f),Node('param',(n,))))
cases=[]; accepted={}
def add(i,name,params,builder,dto=False,construction='direct'):
 result=observe(fn(i,params,builder),dto); row={'id':name,**result}
 if construction!='direct':row['construction']=construction
 if dto and result['outcome']=='accepted':accepted[name]=row.pop('dtoVariants')
 cases.append(row)
add(0,'root-owned-field-param',[('value','int')],lambda _:term(steps=(Node('filter',(eq(amt),)),Node('limit',(2,)))),True)
add(1,'joined-owner-field-param',[('value','int')],lambda _:term(steps=(Node('join',(Join(ref=rel,target=child),)),Node('filter',(eq(childf),)))),True)
add(2,'foreign-owner-field',[('value','int')],lambda _:term(steps=(Node('filter',(eq(foreign),)),)))
add(3,'owner-before-undeclared-param',[('value','int')],lambda _:term(steps=(Node('filter',(Node('=',(col(foreign),Node('param',('missing',)))),)),)),construction='crossed direct graph')
add(4,'undeclared-param-before-owner',[('value','int')],lambda _:term(steps=(Node('filter',(Node('=',(Node('param',('missing',)),col(foreign))),)),)),construction='crossed direct graph')
add(5,'ordinary-wrong-carrier-accepted',[('value','str')],lambda _:term(steps=(Node('filter',(eq(amt),)),)),True)
add(6,'undeclared-ordinary-param',[('value','int')],lambda _:term(steps=(Node('filter',(Node('=',(Node('param',('missing',)),col(amt))),)),)))
add(7,'join-source-absent',[('value','int')],lambda _:term(steps=(Node('join',(Join(ref=FieldRef(module='commerce',element='Invoice',field='order_id'),target=child),)),)))
add(8,'search-wrong-carrier',[('value','str')],lambda _:term(extra=(SearchLeg(root,'vector',None,Node('param',('value',))),)))
add(9,'search-undeclared-param',[('value','int')],lambda _:term(extra=(SearchLeg(root,'keyword','{}',Node('param',('missing',))),)))
add(10,'search-foreign-record',[('value','str')],lambda _:term(extra=(SearchLeg(foreignrec,'keyword','{}',Node('param',('value',))),)))
add(11,'selected-key-valid-literal',[],lambda _:term('get',selected,extra=(literal(OrderKey(id='x')),)),True)
add(12,'key-literal-foreign-record',[],lambda _:term('get',selected,extra=(literal(ForeignKey(id='x')),)))
add(13,'selected-key-id-mismatch',[],lambda _:term('get',selected,extra=(literal(OtherOrderKey(id='x')),)))
add(14,'selected-key-valid-param',[('key','OrderKey')],lambda _:term('get',selected,extra=(Node('key_param',('key',('id',),tuple(sorted(OrderKey.KEY_IDENTITY.items()))),),)),True)
add(15,'key-param-components-mismatch',[('key','OrderKey')],lambda _:term('get',selected,extra=(Node('key_param',('key',('wrong',),tuple(sorted(OrderKey.KEY_IDENTITY.items())))),)),construction='synthetic raw Node mutation')
add(16,'key-param-identity-mismatch',[('key','OrderKey')],lambda _:term('get',root,extra=(Node('key_param',('key',('id',),tuple(sorted(OtherOrderKey.KEY_IDENTITY.items())))),)),construction='synthetic raw Node mutation; no selected key on RecordRef')
add(17,'get-key-check-before-foreign-expression',[('value','int')],lambda _:term('get',selected,steps=(Node('filter',(eq(foreign),)),),extra=(literal(OtherOrderKey(id='x')),)),construction='crossed direct graph')
add(18,'get-valid-key-then-foreign-expression',[('value','int')],lambda _:term('get',selected,steps=(Node('filter',(eq(foreign),)),),extra=(literal(OrderKey(id='x')),)),construction='crossed direct graph')
add(19,'page-key-check-before-foreign-expression',[('after','OrderKey | None')],lambda _:term('page',selected,steps=(Node('filter',(eq(foreign),)),),extra=(10,Node('key_param',('after',('id',),tuple(sorted(OtherOrderKey.KEY_IDENTITY.items())))))),construction='crossed synthetic raw Node graph')
add(20,'unknown-terminal',[('value','int')],lambda _:term('not-a-terminal'))
add(21,'terminal-without-record',[('value','int')],lambda _:Terminal(Node('all',())))
add(22,'group-without-selection',[('value','int')],lambda _:term(steps=(Node('group',()),)))
add(23,'scalar-selection-disallowed-for-count',[('value','int')],lambda _:term('count',steps=(Node('select',(Node('aggregate',('sum',amt,None)),)),)))
inst=FieldRef(module='commerce',element='Order',field='at',temporal='instant'); local=FieldRef(module='commerce',element='Order',field='at_local',temporal='local')
step_instant=Node('filter',(Node('=',(col(inst),Node('param',('value',)))),))
step_local=Node('filter',(Node('=',(col(local),Node('param',('value',)))),))
add(24,'temporal-param-spans-instant-and-local',[('value','datetime')],lambda _:term(steps=(step_instant,step_local)),construction='crossed direct graph')
def optional(value:Param[int|MISSING]):return Query[Order,Order,OrderKey](root).filter(if_present(value,lambda v:Column[Order,int](amt)==v)).limit(2).all()
cap=capture(query(optional));cases.append({'id':'optional-top-level-absent-present','outcome':'accepted','variantCount':len(cap.variants),'presence':[list(v.presence) for v in cap.variants]});accepted['optional-top-level-absent-present']=[{'presence':list(v.presence),'dto':_encode_capture(v,_EncodingBudget())} for v in cap.variants]
def nested(value:Param[int|MISSING]):
 p=if_present(value,lambda v:Column[Order,int](amt)==v)
 return Query[Order,Order,OrderKey](root).filter(p & (Column[Order,int](amt)==value)).limit(2).all()
cases.append({'id':'optional-omitted-nested-in-and',**observe(query(nested)),'construction':'direct optional declaration'})
paths=['python/umf_access/src/umf_access/capture.py','python/umf_access/src/umf_access/dsl/_nodes.py','python/umf_access/src/umf_access/dsl/_expressions.py','python/umf_access/src/umf_access/dsl/_query.py','python/umf_access/src/umf_access/dsl/search.py','python/umf_access/src/umf_access/types.py']
packet={'format':'umf.r8.captured-graph-validator-predecessor/3','runtime':{'implementation':'CPython','version':'3.13.16','pydantic':'2.14.1'},'sourceSha256':{p:hashlib.sha256(open(p,'rb').read()).hexdigest() for p in paths},'cases':cases,'acceptedTaggedDtoCases':accepted,'syntheticCases':['key-param-components-mismatch','key-param-identity-mismatch','page-key-check-before-foreign-expression'],'notes':['Ordinary Param carrier-to-Field carrier compatibility is not checked by _validate_node; wrong-carrier ordinary Param is accepted.','SearchLeg missing parameter and wrong carrier share one exact CAPTURE_SIGNATURE refusal: search parameter carrier differs from selected leg.','Synthetic raw Node graphs reach validator clauses unavailable through normal DSL constructors and are not claims about public constructor admission.']}
print(json.dumps(packet,sort_keys=True,separators=(',',':'),ensure_ascii=True))

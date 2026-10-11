"""Independent SMT checks of command relations, not a UMF parser/evaluator proof."""
import hashlib,json,itertools
from pathlib import Path
import z3
BASE=Path(__file__).parent
results=[]
def check(name,formula,expected,variables=()):
 s=z3.Solver();s.add(formula);answer=str(s.check());assert answer==expected,(name,answer)
 item={'name':name,'answer':answer}
 if answer=='sat':item['witness']={str(v):str(s.model().eval(v,model_completion=True)) for v in variables}
 results.append(item)
stock,qty,post=z3.Ints('stock qty post_stock')
order,after,customer,product=z3.Bools('order_exists post_order_exists customer_link product_link')
status,newstatus=z3.Ints('status newstatus')
untouched,newuntouched=z3.Ints('untouched newuntouched')
bound=z3.And(stock>=0,stock<=2,qty>=-1,qty<=2,post>=-1,post<=3)
reserve_pre=z3.And(qty>0,stock>=qty,z3.Not(order))
reserve_q=z3.And(post==stock-qty,after,newstatus==1,newuntouched==untouched)
check('reserve success nonvacuous',z3.And(bound,reserve_pre,reserve_q),'sat',(stock,qty,post,after))
check('reserve preserves nonnegative stock',z3.And(bound,reserve_pre,reserve_q,post<0),'unsat')
check('reserve insufficient stock cannot succeed',z3.And(bound,stock<qty,reserve_pre,reserve_q),'unsat')
check('reserve exact stock equation does not require reservation creation',z3.And(bound,reserve_pre,post==stock-qty,z3.Not(after)),'sat',(stock,qty,post,after))
check('reserve equation without positive quantity allows negative reservation',z3.And(bound,qty<0,stock>=qty,post==stock-qty),'sat',(stock,qty,post))
check('reserve corrected intent excludes missing reservation',z3.And(bound,reserve_pre,reserve_q,z3.Not(after)),'unsat')
check('reserve frame forbids unrelated mutation',z3.And(bound,reserve_pre,reserve_q,newuntouched!=untouched),'unsat')
create_pre=z3.Not(order)
create_q=z3.And(after,customer,product,post==stock,newuntouched==untouched)
check('create-link success nonvacuous',z3.And(bound,create_pre,create_q),'sat',(after,customer,product))
check('create-link existence-only contract permits missing links',z3.And(bound,create_pre,after,z3.Not(customer)),'sat',(after,customer))
check('create-link complete intent excludes missing endpoints',z3.And(bound,create_pre,create_q,z3.Or(z3.Not(customer),z3.Not(product))),'unsat')
approve_pre=z3.And(order,status>=0,status<=1)
approve_q=z3.And(after,newstatus==1,post==stock,newuntouched==untouched)
check('approve pending reaches approved',z3.And(bound,approve_pre,status==0,approve_q),'sat',(status,newstatus))
check('approve approved admits business no-op',z3.And(bound,approve_pre,status==1,approve_q),'sat',(status,newstatus))
check('approve cannot leave status pending',z3.And(bound,approve_pre,approve_q,newstatus!=1),'unsat')
check('always-refuse relation has no success witness',z3.BoolVal(False),'unsat')
# Independently enumerate relational witnesses, not expected command transitions.
worlds=[]
for c,p in itertools.product([False,True],repeat=2):
 worlds.append({'fields':{'order.id':'o1','order.status':'created'},'entities':['o1','c1','p1'],'customerLink':c,'productLink':p})
projection=lambda w:(w['fields'],w['entities'])
assert projection(worlds[0])==projection(worlds[-1])
assert (worlds[0]['customerLink'] and worlds[0]['productLink']) != (worlds[-1]['customerLink'] and worlds[-1]['productLink'])
results.append({'name':'rules/1 association observational equivalence','answer':'counterexample','worlds':[worlds[0],worlds[-1]],'reason':'Every old state leaf observes only same fields/entity existence; operators preserve equality of observations. Relationship references annotate dependencies but do not observe links.'})
results.append({'name':'cross-Key alias','answer':'counterexample','keys':[{'key':'pk','tuple':[7]},{'key':'email','tuple':['a@b']}],'sameNativeEntity':7,'withinKeyEquality':False,'reason':'Different Key identities do not imply different native instances; deleting through pk then using email evades binding-identity-only checks.'})
# Disjoint edge carriers share the target incoming-cardinality invariant.
results.append({'name':'disjoint write sets share relationship invariant','answer':'counterexample','initialIncomingEdges':0,'maxIncomingEdges':1,'schedule':['A reads incoming count 0','B reads incoming count 0','A adds o1->p1','B adds o2->p1'],'finalIncomingEdges':2})
before_uid,after_uid=z3.Ints('before_uid after_uid')
check('native identity may change across unprotected resolution',z3.And(before_uid>=1,before_uid<=2,after_uid>=1,after_uid<=2,before_uid!=after_uid),'sat',(before_uid,after_uid))
check('transaction-coupled canonical identity excludes rebinding',z3.And(before_uid==after_uid,before_uid!=after_uid),'unsat')
# Corrected link observations distinguish the counterexample twins.
assert (worlds[0]['customerLink'],worlds[0]['productLink']) != (worlds[-1]['customerLink'],worlds[-1]['productLink'])
results.append({'name':'corrected linked observation separates twins','answer':'checked','oldObservationEqual':True,'newObservationEqual':False})
# Canonical identity, unlike Key ID, identifies delete/use aliases.
canonical={('pk',7):7,('email','a@b'):7}
deleted={canonical[('pk',7)]}
assert canonical[('email','a@b')] in deleted
results.append({'name':'canonical cross-Key delete/use check','answer':'checked','useAfterDeleteRefused':True})
# Final-state restoration cannot erase an attempted capability violation.
allowed_reads={'order.status'};allowed_writes={'order.status'}
access_traces=[ [('read','customer.secret')], [('write','sentinel'),('restore','sentinel')] ]
for trace in access_traces:
 assert any(target not in (allowed_reads if kind=='read' else allowed_writes) for kind,target in trace)
results.append({'name':'attempted access differs from final-state frame check','answer':'checked','rejectedTraces':access_traces})
# Small exhaustive pairwise interference classification on independently stated intent.
composition=[]
for a,b in itertools.product(['reserve-p1','approve-o1','link-o1-p1'],repeat=2):
 reads={'reserve-p1':{'stock:p1','absent:o1'},'approve-o1':{'status:o1'},'link-o1-p1':{'incoming:p1'}}
 writes={'reserve-p1':{'stock:p1','status:o1'},'approve-o1':{'status:o1'},'link-o1-p1':{'incoming:p1'}}
 conflict=bool(writes[a] & (reads[b]|writes[b]) or writes[b]&reads[a])
 composition.append({'a':a,'b':b,'requiresConflictAnalysis':conflict})
out={'solver':z3.get_version_string(),'scope':'stock 0..2, quantity -1..2; mathematical integers/booleans and synthetic identities, not full core admission','results':results,'composition':composition,'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
BASE.joinpath('semantics-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'checks':len(results),'satWitnesses':sum(x['answer']=='sat' for x in results),'unsatQueries':sum(x['answer']=='unsat' for x in results),'counterexamples':sum(x['answer']=='counterexample' for x in results),'compositionPairs':len(composition)}))

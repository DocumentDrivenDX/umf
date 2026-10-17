from decimal import Decimal
from dataclasses import replace
from commerce.models import Order,Customer
from relationship_shop.models import Order as CompositeOrder
from relationship_shop.keys import OrderOrderKeyKey
from umf_access.related_keys import make_related_result_model,key_descriptor
from umf_access.dsl import RelatedKeys
from umf_access.dsl._context import CURRENT,CaptureContext
from umf_access.pages import stream_page_size,ReadObligationUnmet
from umf_access.postgres_read import _output_value
checks=[]
class Tag:pass
aliased=Order.c.customer.to_alias(Customer.alias(Tag))
assert aliased.target.alias is not None and aliased.target.key_id==Order.c.customer.target.key_id
assert aliased.key_target==Order.c.customer.key_target
checks.append('to_alias retains original relationshipKey and exact alias metadata')
token=CURRENT.set(CaptureContext(frozenset(),frozenset()))
try:
 inverse=Order.c.customer.inverse()
 assert inverse.key_target==Order.c.customer.inverse_key_target
 assert inverse.source_query==Order.c.customer.target_query
 assert inverse.target_query==Order.c.customer.source_query
 checks.append('inverse uses original inverseKey and swaps selected roots independently')
finally:CURRENT.reset(token)
for artifact,requested in [({'obligations':{'rowCap':10,'streamPageSize':{'parameter':'__umf_page_size','minimum':1,'maximum':11}}},1),({'obligations':None},1),({'obligations':{}},1)]:
 try:stream_page_size(artifact,requested)
 except ReadObligationUnmet:pass
 else:raise AssertionError('invalid page cap admitted')
checks.append('pages malformed owner/domain and unsupported override refuse')
assert _output_value(memoryview(b'\x00\xff'),{'carrier':'binary','decoder':{'profile':'pg-bytea/0.1'},'nullable':False})==b'\x00\xff'
try:_output_value('wrong',{'carrier':'binary','decoder':{'profile':'pg-bytea/0.1'},'nullable':False})
except ReadObligationUnmet:pass
else:raise AssertionError('badbinary')
checks.append('bytes path only converts narrowed allowed native carriers')
# This pure test isolates the create_model diagnostic, with actual generated
# model/Key metadata. It does not qualify any handcrafted native decoder.
decoder={'profile':'pg-related-keys-json/0.1','bound':2,'relationship':{'module':'commerce','id':'parent','direction':'inverse'},'key':key_descriptor(OrderOrderKeyKey)}
extended=make_related_result_model('AuditExtended',CompositeOrder,OrderOrderKeyKey,'keys',decoder,CompositeOrder)
base={'order_id':'o','key_num':1,'key_amount':Decimal('1.0000'),'key_flag':True,'code':'c','parent_id':None,'peer_id':'p','amount':None,'units':None,'memo':None,'active':None}
assert CompositeOrder.model_validate(base,strict=True)
assert extended.model_validate({**base,'keys':RelatedKeys((),False)},strict=True)
for invalid in (True,2**63):
 for model,raw in ((CompositeOrder,{**base,'key_num':invalid}),(extended,{**base,'key_num':invalid,'keys':RelatedKeys((),False)})):
  try:model.model_validate(raw,strict=True)
  except ValueError:pass
  else:raise AssertionError('create_model dropped generated integer validator')
checks.append('related create_model retains original generated field validators')
print('\n'.join(checks))

"""Authored projection/oracle inventories, independent of compiler descriptors."""
RAW_FIELDS=('id','customer','tiny','small','count','big','amount','payload','embedding')
TUPLE_FIELDS=('id','tiny','small','count','big','amount','payload','embedding')
MODEL_FIELDS=('id','name','tiny','small','count','big','amount','payload','embedding')
TUPLE_CARRIERS=('string','integer','integer','integer','integer','decimal','binary','vector')
MODEL_CARRIERS=('string','string','integer','integer','integer','integer','decimal','binary','vector')
def verify_catalog(queries):
 for symbol in ('_Q0','_Q1'):
  plan=getattr(queries,symbol);entry=plan.variants[0].entry;outputs=entry.artifact()['outputs']
  assert len(TUPLE_FIELDS)==8
  assert plan.tuple_fields==tuple('col_'+str(i) for i in range(8))
  assert tuple(entry.result.model_fields)==plan.tuple_fields
  assert tuple(output['name'] for output in outputs)==plan.tuple_fields
  assert tuple(output['carrier'] for output in outputs)==TUPLE_CARRIERS
  assert tuple(output.get('integerWidth',{}).get('bits') for output in outputs[1:5])==(8,16,32,64)
 model=queries._Q2;entry=model.variants[0].entry;outputs=entry.artifact()['outputs']
 assert model.tuple_fields==()
 assert tuple(entry.result.model_fields)==MODEL_FIELDS
 assert tuple(output['name']for output in outputs)==MODEL_FIELDS
 assert tuple(output['carrier']for output in outputs)==MODEL_CARRIERS
 assert outputs[1]['nullable'] is True
 return {'tupleFields':TUPLE_FIELDS,'tupleCarrierInventory':TUPLE_CARRIERS,'modelFields':MODEL_FIELDS,'modelCarrierInventory':MODEL_CARRIERS,'rawNativeOracleFields':RAW_FIELDS,'allInventoryLengthsExact':True}
def tuple_oracle(row):
 assert tuple(row)==RAW_FIELDS
 return [row[name] for name in TUPLE_FIELDS]
def model_oracle(row):
 assert tuple(row)==RAW_FIELDS
 return {'id':row['id'],'name':row['customer'],**{name:row[name] for name in MODEL_FIELDS[2:]}}

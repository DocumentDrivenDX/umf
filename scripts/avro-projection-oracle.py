"""Independent mapped-instance checks for the explicit Avro document binding."""
import json,io,datetime,copy
from decimal import Decimal
from pathlib import Path
import avro.schema,avro.io
from jsonschema import Draft202012Validator
artifact=json.loads(Path('fixtures/avro/document-projection.json').read_text());result=artifact['result']
source=avro.schema.parse(Path('fixtures/avro/order.avsc').read_text());target=Draft202012Validator(json.loads(result['nativeSchema']))
base=artifact['datum']
def native(data):
    d=copy.deepcopy(data)
    d['id']=int(d['id']);d['token']=bytes.fromhex(d['token']);d['payload']=bytes.fromhex(d['payload'])
    d['amount']=Decimal(int.from_bytes(bytes.fromhex(d['amount']),'big',signed=True))/100
    d['created']=datetime.datetime(1970,1,1,tzinfo=datetime.timezone.utc)+datetime.timedelta(milliseconds=int(d['created']))
    if d['parent'] is not None:d['parent']=native(d['parent'])
    return d
vectors=[('valid',{},True,True),('long-overflow',{'id':'9223372036854775808'},False,True),('int-overflow',{'count':2147483648},False,False),('bad-enum',{'status':'MISSING'},False,False),('short-fixed',{'token':'00'},False,False)]
rows=[]
for name,change,avro_expected,json_expected in vectors:
    data={**base,**change};value=native(data)
    try:avro.io.DatumWriter(source).write(value,avro.io.BinaryEncoder(io.BytesIO()));accepted=True
    except Exception:accepted=False
    target_accepted=target.is_valid(data)
    assert (accepted,target_accepted)==(avro_expected,json_expected),(name,accepted,target_accepted)
    rows.append({'name':name,'avroAccepted':accepted,'jsonSchemaAccepted':target_accepted,'requiredIssue':'LONG_ENCODING' if accepted!=target_accepted else None})
def discrepancies_reported(issues):
    return all(not row['requiredIssue'] or any(i['code']==row['requiredIssue'] and i['path']=='/root/fields/0/type' for i in issues) for row in rows)
assert discrepancies_reported(result['issues'])
assert not discrepancies_reported([i for i in result['issues'] if i['code']!='LONG_ENCODING'])
Path('fixtures/avro/projection-oracle-results.json').write_text(json.dumps({'vectors':rows,'negativeControl':'Removing LONG_ENCODING makes fidelity check fail','scope':'Five explicitly mapped instance vectors; not arbitrary Avro instance conversion'},indent=2)+'\n')
print('Avro projection oracle: 5 native/JSON comparisons and missing-loss negative control passed')

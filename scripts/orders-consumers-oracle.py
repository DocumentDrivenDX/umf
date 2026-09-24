import io,json
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
from jsonschema import Draft202012Validator
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
results=[]
for case in json.loads(Path('fixtures/validation/orders-consumers.json').read_text())['cases']:
    bundle=case['bundle'];native=json.loads(bundle['validator']['avro']['nativeSchema'])
    parsed=avro.schema.parse(json.dumps(native))
    target=Draft202012Validator(bundle['validator']['schema']);service=Draft202012Validator(bundle['validator']['serviceSchema'])
    for sample in case['rows']:
        row=sample['output'];target.validate(row);service.validate(row)
        # Independently apply the declared mapping, not the demonstration implementation.
        assert row=={field['target']:sample['source'][field['source']] for field in bundle['transform']['fields']}
        a=io.BytesIO();avro.io.DatumWriter(parsed).write(row,avro.io.BinaryEncoder(a))
        b=io.BytesIO();fastavro.schemaless_writer(b,native,row,strict=True)
        assert a.getvalue()==b.getvalue()
        assert avro.io.DatumReader(parsed).read(avro.io.BinaryDecoder(io.BytesIO(a.getvalue())))==row
        assert fastavro.schemaless_reader(io.BytesIO(b.getvalue()),native)==row
        results.append({'unknownVocabulary':case['unknown'],'orderId':row['orderId'],'bytes':len(a.getvalue()),'binaryAndValuesAgree':True})
    assert not target.is_valid({'orderId':'bad','quantity':2147483648,'isActive':True})
Path('fixtures/validation/orders-consumers-oracle.json').write_text(json.dumps({'avro':avro.__version__,'fastavro':fastavro.__version__,'cases':results,'scope':'Independent DTO JSON Schema validation, declared rename and two Avro binary codecs; no TableSpec row or DDD invariant enforcement'},indent=2)+'\n')
print({'rows':len(results),'codecs':2})

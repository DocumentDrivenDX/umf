import io,json,warnings
from decimal import Decimal
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
rows=[]
for label,extra in [('missing',{}),('zero',{'scale':0}),('null',{'scale':None}),('boolean',{'scale':False}),('string',{'scale':'0'}),('array',{'scale':[]}),('object',{'scale':{}})]:
    native={'type':'bytes','logicalType':'decimal','precision':4,**extra}
    for engine in ['apache','fastavro']:
        row={'case':label,'engine':engine}
        with warnings.catch_warnings(record=True) as notices:
            warnings.simplefilter('always')
            try:
                schema=avro.schema.parse(json.dumps(native)) if engine=='apache' else fastavro.parse_schema(native)
                out=io.BytesIO()
                if engine=='apache':avro.io.DatumWriter(schema).write(Decimal('1'),avro.io.BinaryEncoder(out))
                else:fastavro.schemaless_writer(out,schema,Decimal('1'))
                data=out.getvalue()
                value=avro.io.DatumReader(schema).read(avro.io.BinaryDecoder(io.BytesIO(data))) if engine=='apache' else fastavro.schemaless_reader(io.BytesIO(data),schema)
                row.update(acceptedDecimal=True,hex=data.hex(),value=str(value))
            except Exception as error:row.update(acceptedDecimal=False,errorType=type(error).__name__,message=str(error))
            row['warnings']=sorted(set(str(w.message) for w in notices))
        rows.append(row)
valid=[r for r in rows if r['case'] in ['missing','zero']]
assert all(r['acceptedDecimal'] and r['value']=='1' for r in valid)
assert len({r['hex'] for r in valid})==1
result={'avro':avro.__version__,'fastavro':fastavro.__version__,'cases':rows,'scope':'Missing/zero scale agree on decimal encoding. Malformed-scale parser outcomes are recorded, not used to infer valid Avro semantics; the projection rejects all explicit non-integer scales.'}
Path('fixtures/avro/decimal-boundary-oracle.json').write_text(json.dumps(result,indent=2)+'\n');print({'cases':len(rows),'validEncodingsAgree':True,'malformedAccepted':[r['engine']+':'+r['case'] for r in rows if r['case'] not in ['missing','zero'] and r['acceptedDecimal']]})

import {Schema,RecordBatchJSONWriter} from 'apache-arrow';
import '../native/arrow/schema-probe';
const cases=await Bun.file('fixtures/arrow/schema-cases.json').json();
const source=cases[0].input;const schema=(Schema as any).fromJSON(source);
const json=JSON.parse(new RecordBatchJSONWriter().reset(undefined,schema).finish().toString(true));
const findings={package:'apache-arrow@21.2.0',jsonWriterDropsSchemaMetadata:json.schema.metadata===undefined&&source.metadata.length>0,jsonWriterDropsFieldMetadata:json.schema.fields[0].metadata===undefined&&source.fields[0].metadata.length>0,scope:'Observed schema-only JSON writer behavior; the future UMF adapter must preserve source metadata independently and guard native conversion.'};
if(!findings.jsonWriterDropsSchemaMetadata||!findings.jsonWriterDropsFieldMetadata)throw Error('Pinned writer behavior changed; review evidence');
await Bun.write('fixtures/arrow/writer-boundaries.json',JSON.stringify(findings,null,2)+'\n');console.log(findings);

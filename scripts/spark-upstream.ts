import {importSparkSchema,exportSparkSchema,readDocument,writeDocument} from '../src';
import {parseNativeJson,renderTree} from '../src/model/native-json';
const cases=parseNativeJson(await Bun.file('fixtures/spark/upstream-cases.json').text());if(cases.kind!=='array'||cases.items.length!==42)throw Error('Upstream corpus changed');
for(const item of cases.items){if(item.kind!=='object'||item.members.id?.kind!=='string')throw Error('Invalid case');const id=item.members.id.value,text=renderTree(item.members.input!),doc=id==='41-schema_json'?undefined:importSparkSchema(text,{id});
 if(!doc){let rejected=false;try{importSparkSchema(text,{id});}catch{rejected=true;}if(!rejected)throw Error('Expected nonboolean nullable rejection');continue;}
 for(const format of ['json','yaml'] as const)if(exportSparkSchema(readDocument(writeDocument(doc,format),format))!==text)throw Error('Upstream source changed '+id);
 await Bun.write('fixtures/spark/upstream/'+id+'.json',exportSparkSchema(doc));
}console.log({upstreamRoundTrips:41,structureRejected:1});

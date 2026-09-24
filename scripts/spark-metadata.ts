import {importSparkSchema,exportSparkSchema,inspectSpark,readDocument,writeDocument} from '../src';
const cases=await Bun.file('fixtures/spark/metadata-cases.json').json() as {id:string;text:string}[];
const results=[];
for(const c of cases){const doc=importSparkSchema(c.text,{id:c.id});for(const format of ['json','yaml'] as const)if(exportSparkSchema(readDocument(writeDocument(doc,format),format))!==c.text)throw Error('Metadata changed');await Bun.write('fixtures/spark/metadata/'+c.id+'.json',exportSparkSchema(doc));results.push({id:c.id,diagnostics:inspectSpark(doc).diagnostics});}
await Bun.write('fixtures/spark/metadata-umf-results.json',JSON.stringify({cases:cases.length,results},null,2)+'\n');

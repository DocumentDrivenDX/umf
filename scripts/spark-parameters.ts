import {importSparkSchema,exportSparkSchema,inspectSpark,readDocument,writeDocument} from '../src';
const cases=await Bun.file('fixtures/spark/parameter-cases.json').json(),results=[];
for(const c of cases){const text=JSON.stringify(c.input),doc=importSparkSchema(text,{id:c.id});for(const format of ['json','yaml'] as const)if(exportSparkSchema(readDocument(writeDocument(doc,format),format))!==text)throw Error('Parameter changed');await Bun.write('fixtures/spark/parameters/'+c.id+'.json',exportSparkSchema(doc));results.push({id:c.id,diagnostics:inspectSpark(doc).diagnostics});}
await Bun.write('fixtures/spark/parameter-umf-results.json',JSON.stringify({cases:cases.length,results},null,2)+'\n');

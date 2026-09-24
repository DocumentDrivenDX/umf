import {importSparkSchema,exportSparkSchema,inspectSpark,readDocument,writeDocument} from '../src';
const cases=await Bun.file('fixtures/spark/collation-cases.json').json(),results=[];
for(const c of cases){const text=JSON.stringify(c.input),doc=importSparkSchema(text,{id:c.id});for(const format of ['json','yaml'] as const)if(exportSparkSchema(readDocument(writeDocument(doc,format),format))!==text)throw Error('Collation changed');await Bun.write('fixtures/spark/collations/'+c.id+'.json',exportSparkSchema(doc));results.push({id:c.id,diagnostics:inspectSpark(doc).diagnostics});}
await Bun.write('fixtures/spark/collation-umf-results.json',JSON.stringify({cases:cases.length,results},null,2)+'\n');

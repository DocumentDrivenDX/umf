import {importSparkSchema,projectSparkToArrow,exportArrowFlatbufferModel,readDocument,writeDocument} from '../src';
const base='fixtures/projections/spark-arrow/',native=await Bun.file(base+'native-results.json').json();const results=[];
const canonical=(v:any):string=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
for(const row of native.results){const source=importSparkSchema(await Bun.file(base+row.case+'.spark.json').text(),{id:row.case}),result=projectSparkToArrow(source,{id:row.id,timestampUtc:row.options.timestamp_utc,largeTypes:row.options.prefers_large_types,rejectNestedDuplicates:row.options.error_on_duplicated_field_names_in_struct,lossPolicy:'allow-reported-loss'});
 if((result.status==='projected')!==(row.status==='converted'))throw Error('Status differs '+row.id);
 if(result.target){const expected=JSON.parse(exportArrowFlatbufferModel(readDocument(await Bun.file(base+row.id+'.umf.json').text(),'json'))),actual=JSON.parse(exportArrowFlatbufferModel(result.target));if(canonical(actual)!==canonical(expected))throw Error('Target differs '+row.id+' '+JSON.stringify(actual));await Bun.write(base+row.id+'.projected.json',writeDocument(result.target,'json'));}
 results.push({id:row.id,status:result.status,issues:result.issues});
}
await Bun.write(base+'projection-results.json',JSON.stringify({cases:results.length,projected:results.filter(r=>r.status==='projected').length,results},null,2)+'\n');console.log({cases:results.length,projected:results.filter(r=>r.status==='projected').length});

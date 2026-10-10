import {chromium} from 'playwright';
const built=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/delta-ddl-browser',naming:'umf.js',target:'browser',format:'esm'});
if(!built.success)throw Error(built.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/delta-ddl-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Delta DDL evidence</title>');}});
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
  const result=await page.evaluate(async()=>{
    const path='/umf.js',u=await import(path);
    const schema='{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}';
    const doc=u.defineDeltaTable(schema,{profile:'databricks-managed-delta/0.1',name:['items'],clusterBy:['id'],partitionBy:[],properties:{}},{id:'browser-items'});
    const expected='CREATE TABLE `items` (\n  `id` BIGINT NOT NULL\n) USING DELTA CLUSTER BY (`id`);\n';
    for(const format of ['json','yaml'])if(u.generateDeltaDDL(u.readDocument(u.writeDocument(doc,format),format)).sql!==expected)throw Error('Browser DDL mismatch');
    const decimalSchema=JSON.stringify({type:'struct',fields:[{name:'amount',type:'decimal(38,38)',nullable:false,metadata:{}}]});
    const decimal=u.defineDeltaTable(decimalSchema,{profile:'databricks-managed-delta/0.1',name:['amounts'],clusterBy:[],partitionBy:[],properties:{}},{id:'decimal-browser'});
    for(const format of ['json','yaml']){
      const result=u.generateDeltaDDL(u.readDocument(u.writeDocument(decimal,format),format));
      if(result.schemaJson!==decimalSchema||result.sql!=='CREATE TABLE `amounts` (\n  `amount` DECIMAL(38,38) NOT NULL\n) USING DELTA;\n')throw Error('Decimal recovery mismatch');
    }
    const nestedSchema=JSON.stringify({type:'struct',fields:[{name:'payload',nullable:true,metadata:{},type:{type:'array',elementType:'timestamp_ntz',containsNull:true}}]});
    const nested=u.defineDeltaTable(nestedSchema,{profile:'databricks-managed-delta/0.1',name:['nested'],clusterBy:[],partitionBy:[],properties:{}},{id:'nested-browser'});
    for(const format of ['json','yaml']){
      const result=u.generateDeltaDDL(u.readDocument(u.writeDocument(nested,format),format));
      if(result.schemaJson!==nestedSchema||!result.sql.includes('ARRAY<TIMESTAMP_NTZ>'))throw Error('Nested recovery mismatch');
    }
    const commentSchema=JSON.stringify({type:'struct',fields:[{name:'caption',type:'string',nullable:true,metadata:{comment:"Owner's description 雪"}}]});
    const comments=u.defineDeltaTable(commentSchema,{profile:'databricks-managed-delta/0.1',name:['comments'],clusterBy:[],partitionBy:[],properties:{}},{id:'comment-browser'});
    for(const format of ['json','yaml']){
      const result=u.generateDeltaDDL(u.readDocument(u.writeDocument(comments,format),format));
      if(result.schemaJson!==commentSchema||!result.sql.includes("COMMENT 'Owner\\'s description 雪'"))throw Error('Comment recovery mismatch');
    }
    const bundleDocs=['first','second'].map(id=>u.defineDeltaTable(schema,{profile:'databricks-managed-delta/0.1',name:['catalog','schema',id],clusterBy:[],partitionBy:[],properties:{}},{id}));
    const before=JSON.stringify(bundleDocs);
    for(const format of ['json','yaml']){
      const result=u.generateDeltaDDLBundle(bundleDocs.map(doc=>u.readDocument(u.writeDocument(doc,format),format)));
      if(result.tables.map((table:{documentId:string})=>table.documentId).join(',')!=='first,second'||result.sql!==bundleDocs.map(doc=>u.generateDeltaDDL(doc).sql).join('\n'))throw Error('Bundle recovery mismatch');
    }
    if(JSON.stringify(bundleDocs)!==before)throw Error('Bundle source mutated');
    bundleDocs[1].extensions['umf.delta.definition'].future=true;
    let bundleRefused=false;try{u.generateDeltaDDLBundle(bundleDocs);}catch{bundleRefused=true;}if(!bundleRefused)throw Error('Partial bundle exported');
    doc.extensions['umf.delta.definition'].future={opaque:'18446744073709551615'};
    const restored=u.readDocument(u.writeDocument(doc,'yaml'),'yaml');
    if(restored.extensions['umf.delta.definition'].future.opaque!=='18446744073709551615')throw Error('Unknown content lost');
    let refused=false;try{u.generateDeltaDDL(restored);}catch{refused=true;}if(!refused)throw Error('Unknown meaning exported');
    if('process' in globalThis||'Buffer' in globalThis)throw Error('Node globals available');
    return {bundleJsonYamlDDL:true,bundleUnsupportedRefused:true,commentJsonYamlDDL:true,nestedJsonYamlDDL:true,decimalJsonYamlDDL:true,jsonYamlDDL:true,unknownPreserved:true,unknownDDLRefused:true,nodeGlobalsAbsent:true};
  });
  await Bun.write('fixtures/delta/ddl-browser-results.json',JSON.stringify({...result,browser:browser.version(),qualification:'Ordered complete bundles, atomic, decimal, nested and commented managed-table definitions, JSON/YAML recovery and unknown-content refusal in real Chromium; no native SQL execution.'},null,2)+'\n');
  console.log(result);
} finally {await browser?.close();server.stop(true);}

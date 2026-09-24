import {createHash} from 'node:crypto';
import {importDbtManifest,inspectDbtManifestGraph,readDocument,writeDocument} from '../src';
for(const base of ['fixtures/dbt/','fixtures/dbt/rich/']){
 const raw=await Bun.file(base+'manifest.json').text(),d=importDbtManifest(raw,{id:'graph'}),report=inspectDbtManifestGraph(d);
 for(const f of ['json','yaml'] as const)if(JSON.stringify(inspectDbtManifestGraph(readDocument(writeDocument(d,f),f)))!==JSON.stringify(report))throw Error('Graph differs after round trip');
 await Bun.write(base+'graph-results.json',JSON.stringify({sourceSha256:createHash('sha256').update(raw).digest('hex'),report},null,2)+'\n');
 console.log({base,nodes:report.nodes.length,edges:report.edges.length,status:report.status});
}

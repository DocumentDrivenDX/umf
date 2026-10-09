/** Host orchestration of the existing TableSpec consumer; no UMF data runtime. */
import {domains} from './catalog';
import {resolve} from 'node:path';
const python=process.env.TABLESPEC_PYTHON??'/Users/erik/Projects/tablespec/.venv/bin/python';
for(const id of [...domains.map(d=>d.id),'legal','medical']){
 const pack=resolve('spec/domain-packs/'+id+'/pack.json'),output=resolve('fixtures/domain-packs/'+id+'-1.0.0.zip');
 const args=id==='legal'?['export','--umf',resolve('spec/domain-packs/legal/umf'),'--domain','legal','--domain-pack',pack,'--scale','small','--output',output]:id==='medical'?['ingest','--pack',pack,'--output',output]:['replay','--domain-pack',pack,'--scale','small','--seed','42','--output',output];
 const child=Bun.spawn([python,'-m','tablespec.cli','sample-data',...args],{stdout:'pipe',stderr:'pipe'});
 const [out,err]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);if(await child.exited)throw Error(id+': '+out+err);
 const graph=Bun.spawn(['python3','scripts/domain-packs/graph-fixtures.py','--pack',pack,'--output',resolve('spec/domain-packs/'+id+'/graph/fixture.json'),'--archive',output],{stdout:'pipe',stderr:'pipe'});
 const graphError=await new Response(graph.stderr).text();if(await graph.exited)throw Error(graphError);
 console.log(id+' dataset and graph candidate built');
}

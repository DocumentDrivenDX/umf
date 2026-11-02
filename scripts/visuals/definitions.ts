// SPDX-License-Identifier: MIT OR Apache-2.0
/** Authored display projections. Original tutorial panels remain the companion;
 * connections below are deliberate, never inferred from panel ordering. */
export interface Figure {id:string;figure:string;title:string;kind:string;panels:{title:string;text:string}[]}
function wrap(text:string,width:number){
 const lines:string[]=[];let line='';for(const word of text.split(/\s+/)){if(line&&line.length+1+word.length>width){lines.push(line);line=word;}else line=line?line+' '+word:word;}if(line)lines.push(line);return lines.join('\n');
}
const connections:Record<string,[number,number,string][]>= {
 model:[[2,1,'References the declared Fields']],
 responsibilities:[],approval:[],
 'create-link':[[1,2,'2 · link-customer'],[1,3,'3 · link-product']],
 retry:[[1,2,'Original request'],[2,3,'Acknowledgement lost'],[3,4,'Recover with the original token'],[4,5,'If missing or expired']],
 visibility:[[1,2,'Delivery can arrive out of order'],[2,3,'Apply the complete prefix'],[3,4,'Check reader authorization and freshness']],
 handler:[[1,2,'Bounded authenticated capability RPC'],[2,3,'Check attempts before storage'],[3,4,'Verify before commit']],
 counterexample:[[1,2,'Passes the equation'],[2,3,'Correct the obligations']],
};
export function actionVisual(figure:Figure,mobile=false){
 const links=Object.hasOwn(connections,figure.id)?connections[figure.id]:undefined;if(!links)throw Error('No authored visual projection for '+figure.id);
 const nodes=figure.panels.map((panel,index)=>({id:'panel-'+(index+1),label:wrap(figure.id==='retry'&&index===2?'Response lost · '+panel.title:panel.title,28),detail:wrap(panel.text,38)}));
 return {id:'actions-'+figure.id,kind:'flow' as const,form:'network' as const,title:figure.figure+' · '+figure.title,
  question:figure.title,source:{path:'docs/helix/04-build/guides/actions/diagrams/source.json',view:figure.id},
  layout:{kind:'grid' as const,columns:mobile?1:2,order:nodes.map(node=>node.id)},
  nodes,...(links.length?{edges:links.map(([from,to,label],index)=>({id:'connection-'+(index+1),from:'panel-'+from,to:'panel-'+to,label,directed:true}))}:{}),
  omissions:['This is a concept-map presentation of the original tutorial panels. Original storyboard-specific positions, swimlanes, sequence lifelines, state glyphs and timeline geometry are not reproduced. All authored panel text remains visible and in the source companion.'],
 };
}
export const fabricVisual={id:'schema-interchange-fabric',kind:'structure' as const,form:'stack' as const,
 title:'Schema interchange fabric',question:'How does metadata travel from models to tools?',
 nodes:[{id:'native',label:'Native schema',layer:'producers'},{id:'authored',label:'Authored model',layer:'producers'},
  {id:'umf',label:'UMF',detail:'Common metadata + native details',layer:'metadata'},
  {id:'generators',label:'Generators',layer:'consumers'},{id:'forms',label:'Forms',layer:'consumers'},{id:'ai',label:'AI context',layer:'consumers'}],
 structure:{layers:[{id:'producers',label:'Source models'},{id:'metadata',label:'Portable metadata'},{id:'consumers',label:'Metadata consumers'}]},
 takeaway:'Tools read the metadata they need. Support varies by format and operation.',
};
export function visualDocument(visual:ReturnType<typeof actionVisual>|typeof fabricVisual){
 return {umf:'0.10.0' as const,id:'visual:'+visual.id,vocabularies:{'umf.visual':{version:'1.3.0'}},modules:[],extensions:{'umf.visual':visual}};
}

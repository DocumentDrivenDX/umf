import {importLinkmlDocument,inspectLinkmlImportContext,readDocument,writeDocument,type LinkmlImportContext} from '../src';
const definitions=[
 {id:'diamond',graph:{root:['left','right'],left:['shared'],right:['shared'],shared:[],unused:[]}},
 {id:'cycle-repeat',graph:{root:['left','left'],left:['root']}},
 {id:'missing',graph:{root:['missing']}},
 {id:'scoped',graph:{root:['left','right'],left:['common'],right:['common'],a:[],b:[]}}
];
const cases=[];
for(const c of definitions){
 const sources=Object.entries(c.graph).map(([key,imports])=>({key,text:JSON.stringify({id:'https://example.org/'+key,name:key,imports})}));
 const bindings=sources.flatMap(s=>[...new Set(JSON.parse(s.text).imports as string[])].flatMap(literal=>{
  const target=c.id==='scoped'&&literal==='common'?(s.key==='left'?'a':'b'):literal;
  return sources.some(x=>x.key===target)?[{from:s.key,import:literal,target}]:[];
 }));
 const context:LinkmlImportContext={entry:'root',schemas:sources.map(s=>({key:s.key,document:importLinkmlDocument(s.text,{id:s.key,format:'json'})})),bindings};
 const reports=[];
 for(const format of ['json','yaml'] as const){const restored={...context,schemas:context.schemas.map(s=>({...s,document:readDocument(writeDocument(s.document,format),format)}))};const report=inspectLinkmlImportContext(restored);if(JSON.stringify(report)!==JSON.stringify(inspectLinkmlImportContext(context)))throw Error('Report roundtrip differs');reports.push({format,report});}
 cases.push({id:c.id,sources,context,reports});
}
await Bun.write('fixtures/linkml/imports/results.json',JSON.stringify({cases},null,2)+'\n');console.log('LinkML imports: 4 contexts, 8 UMF format reports');

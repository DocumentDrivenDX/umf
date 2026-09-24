import {importLinkmlDocument,inspectLinkmlClassSlots,getLinkmlDocumentNode,readDocument,writeDocument} from '../src';
const manifest=await Bun.file('native/linkml/sources/manifest.json').json();
const paths=[...manifest.files.filter((f:any)=>f.path.endsWith('.yaml')&&(f.upstreamPath.startsWith('tests/input/examples/')||f.upstreamPath.startsWith('linkml_model/model/schema/'))).map((f:any)=>f.path),'native/linkml/examples/people.yaml','native/linkml/examples/inheritance.json'];
const cases=[];
for(const path of paths){const format=path.endsWith('.json')?'json':'yaml',raw=await Bun.file(path).text(),d=importLinkmlDocument(raw,{id:path,format});let classes;try{classes=getLinkmlDocumentNode(d,'/classes');}catch{continue;}if(classes.kind!=='object')continue;
 const reports=[];for(const className of Object.keys(classes.members))for(const format of ['json','yaml'] as const){const {source,...report}=inspectLinkmlClassSlots(readDocument(writeDocument(d,format),format),className);reports.push({format,report});}
 cases.push({path,format,reports});
}
await Bun.write('fixtures/linkml/class-slots/results.json',JSON.stringify({cases},null,2)+'\n');console.log({sources:cases.length,reports:cases.reduce((n,c)=>n+c.reports.length,0)});

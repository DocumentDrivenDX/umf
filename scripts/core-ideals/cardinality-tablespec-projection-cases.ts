import {declareCoreCardinality,copyJson,type Document,type CoreCardinalityDeclaration,type CardinalityTableSpecRequest} from '../../src';
export function cardinalityTableSpecProjectionCases(){
 const rows:{name:string;author:CoreCardinalityDeclaration;request:CardinalityTableSpecRequest;expectedStatus:'blocked'|'projected'}[]=[];
 for(const cardinality of ['one','array','map','unspecified'] as const)for(const item of ['missing','float','nested','record','unknown'] as const)for(const profile of ['generated-json','generated-spark','unresolved'] as const)for(const mode of ['strict','report'] as const){
  if(!['array','map'].includes(cardinality)&&item!=='missing')continue;
  const source:Document={umf:'0.4.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',extensions:{}}]}]};
  if(item==='unknown')source.vocabularies['future.item']={version:'1.0.0'};
  if(item!=='missing'){
   const field={id:'item',kind:'field',extensions:{},...(item==='float'?{scalarType:'float',cardinality:'one',nullability:'absent-allowed'}:item==='nested'?{cardinality:'array',itemType:{module:'m',element:'item'}}:item==='unknown'?{cardinality:'future',extensions:{'future.item':{opaque:true}}}: {references:[{module:'m',element:'record',role:'record-type'}]})};
   source.modules[0]!.elements.push(field);
   if(item==='record')source.modules[0]!.elements.push({id:'record',kind:'record',extensions:{}});
  }
  const author=declareCoreCardinality(source,{module:'m',element:'value'},{cardinality,...(item!=='missing'?{itemType:{module:'m',element:'item'}}:{})});
  const request:CardinalityTableSpecRequest={id:'native',tableName:'Shapes',columnName:'value',nativeType:cardinality==='array'?'EMBEDDING':'TEXT',dimension:cardinality==='array'?3:null,profile,mode,requireExactValues:false};
  const blocked=mode==='strict'&&(profile==='unresolved'||cardinality==='array'||cardinality==='map');
  rows.push({name:cardinality+'-'+item,author,request,expectedStatus:blocked?'blocked':'projected'});
 }
 // Exactness and unknown source obligations are separate from shape labels.
 for(const requireExactValues of [false,true])for(const mode of ['strict','report'] as const){
  const source:Document={umf:'0.4.0',id:'float',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',scalarType:'float',extensions:{}}]}]};
  const author=declareCoreCardinality(source,{module:'m',element:'value'},{cardinality:'one'});
  const request:CardinalityTableSpecRequest={id:'native',tableName:'Shapes',columnName:'value',nativeType:'FLOAT',dimension:null,profile:'generated-spark',mode,requireExactValues};
  rows.push({name:'scalar-float-exactness',author,request,expectedStatus:mode==='strict'&&requireExactValues?'blocked':'projected'});
 }
 const base=rows[0]!;
 for(const mode of ['strict','report'] as const){const source=copyJson(base.author.source) as unknown as Document;source.extensions={'future.document':{unknown:1}};source.vocabularies['future.document']={version:'1.0.0'};const author=declareCoreCardinality(source,base.author.identity,{cardinality:'one'});rows.push({name:'unknown-source',author,request:{...base.request,mode},expectedStatus:mode==='strict'?'blocked':'projected'});}
 return rows;
}

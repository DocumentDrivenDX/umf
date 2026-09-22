import {SCALAR_TYPES,type JsonObject} from '../src/model/types';
export interface FacetCase {id:string;element:JsonObject;valid:boolean;warnings:boolean;}
export function facetCases():FacetCase[]{
 const rows:FacetCase[]=[];
 const add=(id:string,element:JsonObject,valid:boolean,warnings=false)=>rows.push({id,element,valid,warnings});
 const field=(family:string,facets:JsonObject):JsonObject=>({id:'value',kind:'field',scalarType:family,facets,extensions:{}});
 const groups:[string,JsonObject,string[]][]=[['empty',{},[...SCALAR_TYPES]],['unicode',{length:{max:12,unit:'unicode-scalar'}},['string']],['bytes',{length:{max:12,unit:'byte'}},['binary']],['decimal',{precision:38,scale:9},['decimal']],['signed',{integerWidth:{bits:64,signed:true}},['integer']],['unsigned',{integerWidth:{bits:64,signed:false}},['integer']]];
 for(const family of SCALAR_TYPES)for(const [label,facets,compatible] of groups)add(family+'-'+label,field(family,facets),compatible.includes(family));
 for(const bound of [0,1,Number.MAX_SAFE_INTEGER,-1,1.5]){
  add('length-'+bound,field('string',{length:{max:bound,unit:'unicode-scalar'}}),bound>=0&&Number.isInteger(bound));
  add('width-'+bound,field('integer',{integerWidth:{bits:bound,signed:true}}),bound>0&&Number.isInteger(bound));
 }
 for(const [precision,scale,valid] of [[1,0,true],[1,1,true],[1,2,false],[0,0,false],[38,-1,false],[38,1.5,false],[1.5,1,false],[Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,true]] as const)add('decimal-'+precision+'-'+scale,field('decimal',{precision,scale}),valid);
 for(const [name,facets] of [['precision-only',{precision:3}],['scale-only',{scale:0}],['null-precision',{precision:null,scale:0}],['width-without-sign',{integerWidth:{bits:8}}],['string-sign',{integerWidth:{bits:8,signed:'false'}}],['length-without-unit',{length:{max:8}}],['empty-unit',{length:{max:8,unit:''}}]] as [string,JsonObject][])add(name,field(name.includes('width')||name.includes('sign')?'integer':name.includes('length')||name.includes('unit')?'string':'decimal',facets),false);
 for(const kind of ['record','group','future'])add('kind-'+kind,{...field('string',{}),kind},false);
 for(const cardinality of ['one','unspecified','array','map','future'])add('shape-'+cardinality,{...field('string',{}),cardinality},cardinality==='one'||cardinality==='unspecified');
 add('unknown-only-container',{id:'container',kind:'field',cardinality:'array',facets:{future:{bounds:'unknown'}},extensions:{}},false);
 add('record-reference',{...field('integer',{integerWidth:{bits:8,signed:false}}),references:[{role:'record-type',module:'m',element:'record'}]},false);
 add('unknown-unit-string',field('string',{length:{max:4,unit:'future-codepoints'}}),true,true);
 add('unknown-unit-binary',field('binary',{length:{max:4,unit:'future-codepoints'}}),true,true);
 add('unknown-unit-integer',field('integer',{length:{max:4,unit:'future-codepoints'}}),false);
 add('unknown-qualifiers',field('integer',{integerWidth:{bits:8,signed:true,future:{exact:'9007199254740993'}},'a/b~c':{native:['retained',null]}}),true,true);
 add('unknown-length-qualifier',field('string',{length:{max:8,unit:'unicode-scalar',normalization:'uninterpreted'}}),true,true);
 add('future-only',{id:'future',kind:'field',facets:{future:{meaning:'uninterpreted'}},extensions:{}},true,true);
 add('no-facets',{id:'value',kind:'field',extensions:{}},true);
 add('empty-without-family',{id:'value',kind:'field',facets:{},extensions:{}},true);
 add('bound-without-family',{id:'value',kind:'field',facets:{integerWidth:{bits:8,signed:true}},extensions:{}},false);
 add('null-facets',{id:'value',kind:'field',facets:null,extensions:{}},false);
 return rows;
}
export const facetNumericTokens=[{token:'0',accepted:true},{token:'1.0',accepted:true},{token:'1e3',accepted:true},{token:'9.007199254740991e15',accepted:true},{token:'1.00000000000000001',accepted:false},{token:'9007199254740990.5',accepted:false},{token:'9007199254740992',accepted:false},{token:'-0',accepted:false},{token:'1e309',accepted:false}];

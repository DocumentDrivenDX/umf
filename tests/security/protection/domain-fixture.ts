export const domainRef=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
export function domainFixture(){
 const input=domainRef('input'),output=domainRef('output'),parameter=domainRef('parameter');
 const field=(id:string,scalarType:string)=>({id,kind:'field',scalarType,cardinality:'one',nullability:'required',extensions:{}});
 const document={umf:'0.8.0',id:'domain',vocabularies:{},modules:[{id:'m',namespace:'',elements:[field('input','integer'),field('output','string'),field('parameter','integer'),{id:'record',kind:'record',extensions:{}}]}]};
 const closure={pins:[{documentId:'domain',revision:'schema1'}],documents:[{revision:'schema1',document}]};
 const catalog:any={vocabulary:'umf.security.protection',version:'0.1.0',id:'catalog',revision:'c1',transforms:[{id:'transform',version:'t1',kind:'mask',function:'constant',inputDomain:input,outputDomain:output,determinism:'deterministic',reversibility:'none',disclosureProfile:[{kind:'range',bucket:{field:parameter,value:{integerToken:'10'}}}],queryUse:{},parameters:[{name:'value',field:parameter,value:{integerToken:'100'}}]}],native:{sql:'opaque\r\n😀'}};
 const policy:any={vocabulary:'umf.security',version:'0.2.0',id:'p',revision:'p1',ontology:{documentId:'ontology',revision:'o1'},protection:{id:'catalog',revision:'c1'},rules:[{id:'permit',effect:'permit',actions:['read'],target:[domainRef('record')],condition:{op:'literal',value:true},disclosure:[{field:input,disposition:{kind:'transformed',vocabulary:'umf.security.protection',transform:'transform',version:'t1',field:output}}]}]};
 return {policy,catalog,closure};
}

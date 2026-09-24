import type SHACLValidator from 'rdf-validate-shacl';
import ShapesGraph from 'rdf-validate-shacl/src/shapes-graph.js';
import {rdfListToArray} from 'rdf-validate-shacl/src/dataset-utils.js';
import {UmfError} from '../../model/types';
const X='http://www.w3.org/2001/XMLSchema#';
/** Unicode scalar ordering, independent of host locale and UTF-16 surrogate ordering. */
export function compareShaclStrings(a:string,b:string):number{
 const ai=a[Symbol.iterator](),bi=b[Symbol.iterator]();while(true){const av=ai.next(),bv=bi.next();if(av.done||bv.done)return av.done?(bv.done?0:-1):1;const ac=av.value.codePointAt(0)!,bc=bv.value.codePointAt(0)!;if(ac!==bc)return ac<bc?-1:1;}
}
export function installShaclStrings(validator:SHACLValidator):void{
 const {sh}=validator.ns;
 for(const [name,predicate] of [['MinLength','minLength'],['MaxLength','maxLength']] as const){const component=sh[name+'ConstraintComponent']!,native=validator.validators.get(component)!;
 validator.validators.set(component,{...native,validate(context,focus,value,constraint){
  const bound=constraint.getParameterValue(sh[predicate]!)!,lexical=bound.value.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g,'');
  if(bound.termType!=='Literal'||bound.datatype.value!==X+'integer'||!/^\+?[0-9]+$(?![\s\S])/.test(lexical)&&! /^-0+$(?![\s\S])/.test(lexical))throw new UmfError('SHACL_STRING_SHAPE','Length bound must be a nonnegative xsd:integer');
  if(value.termType==='BlankNode')return false;let count=0;for(const _ of value.value)count++;
  return name==='MinLength'?BigInt(count)>=BigInt(lexical):BigInt(count)<=BigInt(lexical);
 }});
 }
 const component=sh.LanguageInConstraintComponent!,native=validator.validators.get(component)!;
 validator.validators.set(component,{...native,validate(context,focus,value,constraint){
  const head=constraint.getParameterValue(sh.languageIn!)!,ranges=rdfListToArray(context.$shapes.node(head));
  for(const range of ranges)if(range.termType!=='Literal'||range.datatype.value!==X+'string'||! /^(?:\*|[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*)$(?![\s\S])/.test(range.value))throw new UmfError('SHACL_STRING_SHAPE','Expected basic language ranges as xsd:string literals');
  if(value.termType!=='Literal'||!value.language)return false;const language=value.language.toLowerCase();
  return ranges.some(range=>{const r=range.value.toLowerCase();return r==='*'||language===r||language.startsWith(r+'-');});
 }});
 validator.shapesGraph=new ShapesGraph(validator);
}

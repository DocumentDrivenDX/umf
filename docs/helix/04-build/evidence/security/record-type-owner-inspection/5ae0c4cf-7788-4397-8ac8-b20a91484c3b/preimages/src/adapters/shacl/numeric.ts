import type {Term} from '@rdfjs/types';
import type SHACLValidator from 'rdf-validate-shacl';
import ShapesGraph from 'rdf-validate-shacl/src/shapes-graph.js';
import {getPathObjects} from 'rdf-validate-shacl/src/property-path.js';
import {fromRdf} from 'rdf-literal';
import {UmfError} from '../../model/types';
import {parseShaclFloat} from './float';
import {compareShaclStrings} from './strings';
const X='http://www.w3.org/2001/XMLSchema#';
const bounds:Record<string,[bigint|null,bigint|null]>={integer:[null,null],long:[-9223372036854775808n,9223372036854775807n],int:[-2147483648n,2147483647n],short:[-32768n,32767n],byte:[-128n,127n],unsignedLong:[0n,18446744073709551615n],unsignedInt:[0n,4294967295n],unsignedShort:[0n,65535n],unsignedByte:[0n,255n],nonNegativeInteger:[0n,null],positiveInteger:[1n,null],nonPositiveInteger:[null,0n],negativeInteger:[null,-1n]};
interface Decimal {sign:number;digits:string;scale:number}
const family=(term:Term)=>term.termType==='Literal'&&term.datatype.value.startsWith(X)&&(term.datatype.value===X+'decimal'||Object.hasOwn(bounds,term.datatype.value.slice(X.length)));
function parse(term:Term):Decimal|null{
 if(term.termType!=='Literal'||!family(term))return null;
 const name=term.datatype.value.slice(X.length),text=term.value.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g,'');
 if(!(name==='decimal'?/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$(?![\s\S])/:/^[+-]?[0-9]+$(?![\s\S])/).test(text))return null;
 if(name!=='decimal'){const n=BigInt(text),[min,max]=bounds[name]!;if(min!==null&&n<min||max!==null&&n>max)return null;}
 const negative=text.startsWith('-'),[whole,frac='']=text.replace(/^[+-]/,'').split('.');let digits=(whole!+frac).replace(/^0+/,'');if(!digits)return {sign:0,digits:'0',scale:0};const trimmed=digits.replace(/0+$/,'');return {sign:negative?-1:1,digits:trimmed,scale:frac.length-(digits.length-trimmed.length)};
}
function compare(a:Decimal,b:Decimal):number{
 if(a.sign!==b.sign)return a.sign<b.sign?-1:1;if(!a.sign)return 0;
 const ae=a.digits.length-a.scale,be=b.digits.length-b.scale;if(ae!==be)return (ae<be?-1:1)*a.sign;
 const length=Math.max(a.digits.length,b.digits.length),ad=a.digits.padEnd(length,'0'),bd=b.digits.padEnd(length,'0');return (ad===bd?0:ad<bd?-1:1)*a.sign;
}
/** Exact decimal ordering and XPath numeric promotion with direct binary32 conversion. */
function ordering(a:Term,b:Term):number|null{
 if(a.termType!=='Literal'||b.termType!=='Literal')return null;
 const af=family(a),bf=family(b);
 if(af&&bf){const av=parse(a),bv=parse(b);return av&&bv?compare(av,bv):null;}
 const binary=(t:typeof a)=>t.datatype.value===X+'float'||t.datatype.value===X+'double';
 if(af||bf||binary(a)||binary(b)){
  if(!(af||binary(a))||!(bf||binary(b)))return null;
  const width=a.datatype.value===X+'double'||b.datatype.value===X+'double'?64:32;
  const promote=(t:typeof a):{value:number}|null=>{if(family(t)){const value=parse(t);return value?parseShaclFloat((value.sign<0?'-':'')+value.digits+'e'+(-value.scale),width):null;}return parseShaclFloat(t.value,t.datatype.value===X+'float'?32:64);};
  const av=promote(a),bv=promote(b);if(!av||!bv||Number.isNaN(av.value)||Number.isNaN(bv.value))return null;
  return av.value===bv.value?0:av.value<bv.value?-1:1;
 }
 if(a.datatype.value===X+'string'||b.datatype.value===X+'string')return a.datatype.value===X+'string'&&b.datatype.value===X+'string'?compareShaclStrings(a.value,b.value):null;
 // Preserve the pinned engine's behavior outside the numeric and xsd:string scope.
 const timezone=(n:typeof a)=>n.datatype.value===X+'dateTime'&&/^.*(((\+|-)\d{2}:\d{2})|Z)$/.test(n.value);
 if(timezone(a)!==timezone(b))return null;const av=fromRdf(a),bv=fromRdf(b);if(typeof av!==typeof bv)return null;
 return typeof av==='string'?av.localeCompare(bv as string):(av as any)-(bv as any);
}
export function installExactShaclNumbers(validator:SHACLValidator):void{
 const {sh}=validator.ns;
 for(const [name,predicate] of [['MinInclusive','minInclusive'],['MinExclusive','minExclusive'],['MaxInclusive','maxInclusive'],['MaxExclusive','maxExclusive']] as const){const component=sh[name+'ConstraintComponent']!,native=validator.validators.get(component)!;
 validator.validators.set(component,{...native,validate(context,focus,value,constraint){const n=ordering(value,constraint.getParameterValue(sh[predicate]!)!);return n!==null&&(name==='MinInclusive'?n>=0:name==='MinExclusive'?n>0:name==='MaxInclusive'?n<=0:n<0);}});
 }
 for(const [name,predicate] of [['LessThan','lessThan'],['LessThanOrEquals','lessThanOrEquals']] as const){const component=sh[name+'ConstraintComponent']!,native=validator.validators.get(component)!;
 validator.validators.set(component,{...native,propertyValidate(context,focus,value,constraint){const values=getPathObjects(context.$data,focus,constraint.shape.pathObject!),refs=context.$data.node(focus).out(constraint.getParameterValue(sh[predicate]!)!).terms,invalid=[];
 for(const v of values)for(const ref of refs){const n=ordering(v,ref);if(n===null||(name==='LessThan'?n>=0:n>0))invalid.push({value:v});}return invalid;}});
 }
 const component=sh.DatatypeConstraintComponent!,native=validator.validators.get(component)!;
 if(!('validate' in native))throw new UmfError('SHACL_ENGINE_API','Pinned datatype validator interface changed');
 validator.validators.set(component,{...native,validate(context,focus,value,constraint){const required=constraint.getParameterValue(sh.datatype!)!;if(required.value===X+'float'||required.value===X+'double')return value.termType==='Literal'&&value.datatype.equals(required)&&parseShaclFloat(value.value,required.value===X+'float'?32:64)!==null;if(required.termType==='NamedNode'&&(required.value===X+'decimal'||Object.hasOwn(bounds,required.value.slice(X.length))&&required.value.startsWith(X)))return value.termType==='Literal'&&value.datatype.equals(required)&&parse(value)!==null;return native.validate(context,focus,value,constraint);}});
 // Components bind validators during construction; rebuild before any shape is interpreted.
 validator.shapesGraph=new ShapesGraph(validator);
}

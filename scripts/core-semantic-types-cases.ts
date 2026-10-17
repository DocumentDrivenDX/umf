import fixture from '../fixtures/core/semantic-types.json';
import {copyJson} from '../src/model/json';
import type {Document,CoreSemanticTypeReference} from '../src/model/types';
export const semanticTypesFixture=()=>copyJson(fixture) as unknown as Document;
export function semanticTypesCases(){
 const rows:{id:string;document:Document;valid:boolean}[]=[];
 const add=(id:string,update:(doc:Document)=>void,valid:boolean)=>{const doc=semanticTypesFixture();update(doc);rows.push({id,document:doc,valid});};
 add('declared',()=>{},true);
 add('missing',doc=>{delete doc.modules[0]!.elements[0]!.semanticTypes;},true);
 add('namespace-and-release',doc=>{(doc.modules[0]!.elements[0]!.semanticTypes as CoreSemanticTypeReference[]).push({vocabulary:'other',version:'next',term:'email'});},true);
 add('unknown-qualifier',doc=>{(doc.modules[0]!.elements[0]!.semanticTypes as CoreSemanticTypeReference[])[0]!.future={retained:true};},true);
 for(const [id,value] of Object.entries({empty:[],null:null,string:'email',emptyReference:[{}],emptyTerm:[{vocabulary:'v',version:'1',term:''}],numericVersion:[{vocabulary:'v',version:1,term:'email'}],rangeVersion:[{vocabulary:'v',version:'^1.0.0',term:'email'}]}))add(id,doc=>{(doc.modules[0]!.elements[0]! as any).semanticTypes=value;},id==='rangeVersion');
 // Release IDs are opaque strings. A range-looking spelling has no range semantics.
 add('root-is-opaque',doc=>{doc.semanticTypes={future:true};},true);
 add('native-reference-broken',doc=>{doc.modules[0]!.elements[0]!.references=[{role:'record-type',module:'missing',element:'missing'}];},false);
 add('inherited-property-invalid',doc=>{doc.modules[0]!.elements[0]!.default={value:{integerToken:'1'},on:'missing'};},false);
 const exact=(doc:Document,kind:'uuid'|'bits128',value:string)=>{const e=doc.modules[0]!.elements[0]!;e.scalarType=kind;delete e.allowedValues;delete e.default;delete e.facets;e.examples=[kind==='uuid'?{uuid:value}:{bits128Hex:value}];};
 add('uuid-composed',doc=>exact(doc,'uuid','01234567-89ab-cdef-8123-456789abcdef'),true);
 add('uuid-invalid-spelling',doc=>exact(doc,'uuid','invalid'),false);
 add('bits128-composed',doc=>exact(doc,'bits128','ffffffffffffffffffffffffffffffff'),true);
 add('bits128-invalid-width',doc=>exact(doc,'bits128','ff'),false);
 return rows;
}

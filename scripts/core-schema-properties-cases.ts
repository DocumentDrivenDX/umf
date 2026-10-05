import {type Document} from '../src/model/types';
export function schemaPropertiesFixture():Document {
 return {umf:'0.8.0',id:'schema-properties',vocabularies:{},title:'Orders',aliases:['sales'],modules:[{id:'m',namespace:'sales',title:'Sales',aliases:['commerce'],elements:[
  {id:'quantity',name:'quantity',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{},facets:{integerWidth:{bits:64,signed:true}},title:'Quantity',aliases:['qty'],examples:[{integerToken:'3'}],allowedValues:[{integerToken:'1'},{integerToken:'2'}],default:{value:{integerToken:'1'},on:'missing'},},
  {id:'price',kind:'field',scalarType:'decimal',nullability:'required',extensions:{},facets:{precision:20,scale:2,range:{min:{decimalToken:'0.01'},max:{decimalToken:'999999999999999999.99'}}},examples:[{decimalToken:'1.20'}],default:{value:{decimalToken:'1.20'},on:'missing-or-null'}},
  {id:'label',kind:'field',scalarType:'string',nullability:'absent-allowed',extensions:{},facets:{length:{min:1,max:3,unit:'unicode-scalar'}},examples:[{string:'😀'}],default:{value:{string:'new'},on:'null'}},
  {id:'byte',kind:'field',scalarType:'binary',extensions:{},facets:{length:{min:1,max:2,unit:'byte'}},allowedValues:[{binaryHex:'ff'}]},
  {id:'vector-item',kind:'field',scalarType:'integer',extensions:{}},
  {id:'vector',kind:'field',cardinality:'array',itemType:{module:'m',element:'vector-item'},extensions:{},facets:{collectionSize:{min:2,max:2}},examples:[{array:[{integerToken:'1'},{integerToken:'1'}]}],default:{value:{array:[{integerToken:'0'},{integerToken:'0'}]},on:'missing'}},
 ]}]};
}
export function schemaPropertiesCases(){
 const rows:{id:string;document:Document;valid:boolean}[]=[{id:'valid',document:schemaPropertiesFixture(),valid:true}];
 const bad=(id:string,edit:(doc:Document)=>void)=>{const document=schemaPropertiesFixture();edit(document);rows.push({id,document,valid:false});};
 bad('duplicate-equal-integers',d=>d.modules[0]!.elements[0]!.allowedValues=[{integerToken:'1'},{integerToken:'1e0'}]);
 bad('duplicate-equal-decimals',d=>d.modules[0]!.elements[1]!.allowedValues=[{decimalToken:'1.20'},{decimalToken:'1.2'}]);
 bad('duplicate-equal-binary',d=>d.modules[0]!.elements[3]!.allowedValues=[{binaryHex:'ff'},{binaryHex:'FF'}]);
 bad('invalid-default-domain',d=>(d.modules[0]!.elements[0]!.default as any).value={string:'1'});
 bad('default-not-in-set',d=>(d.modules[0]!.elements[0]!.default as any).value={integerToken:'3'});
 bad('fractional-integer',d=>d.modules[0]!.elements[0]!.examples=[{integerToken:'1.5'}]);
 bad('decimal-rounding',d=>d.modules[0]!.elements[1]!.examples=[{decimalToken:'1.001'}]);
 bad('collection-size',d=>(d.modules[0]!.elements[5]!.default as any).value={array:[{integerToken:'1'}]});
 bad('min-length',d=>d.modules[0]!.elements[2]!.examples=[{string:''}]);
 bad('surrogate',d=>d.modules[0]!.elements[2]!.examples=[{string:'\ud800'}]);
 bad('empty-range',d=>(d.modules[0]!.elements[1]!.facets as any).range={min:{decimalToken:'1.00'},max:{decimalToken:'1'},maxInclusive:false});
 bad('unpaired-flag',d=>(d.modules[0]!.elements[1]!.facets as any).range={min:{decimalToken:'1'},maxInclusive:true});
 bad('inverted-length',d=>(d.modules[0]!.elements[2]!.facets as any).length.min=4);
 bad('inverted-size',d=>(d.modules[0]!.elements[5]!.facets as any).collectionSize.min=3);
 bad('collection-bound-on-scalar',d=>(d.modules[0]!.elements[4]!.facets as any)={collectionSize:{min:1}});
 bad('range-on-string',d=>(d.modules[0]!.elements[2]!.facets as any).range={min:{string:'a'}});
 bad('unknown-default-behavior',d=>(d.modules[0]!.elements[0]!.default as any).on='always');
 bad('null-numeric-bound',d=>{const f=d.modules[0]!.elements[4]!;f.nullability='absent-allowed';f.facets={range:{min:null}};});
 bad('unknown-facet-inverted-range',d=>d.modules[0]!.elements[4]!.facets={future:true,range:{min:{integerToken:'10'},max:{integerToken:'1'}}});
 bad('empty-discrete-integer-range',d=>d.modules[0]!.elements[4]!.facets={range:{min:{integerToken:'0'},max:{integerToken:'1'},minInclusive:false,maxInclusive:false}});
 bad('empty-discrete-decimal-range',d=>{const f=d.modules[0]!.elements[1]!;delete f.examples;delete f.default;f.facets={precision:20,scale:2,range:{min:{decimalToken:'0'},max:{decimalToken:'0.01'},minInclusive:false,maxInclusive:false}};});
 return rows;
}

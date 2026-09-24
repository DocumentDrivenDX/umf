import vectors from '../fixtures/key/tuple-encoding-v1.json';
export const tupleIdentity={module:'m',element:'record',key:'stable-key'};
export function tupleDocument(fields:readonly any[]):any{
 const elements=fields.map(f=>{const e:any={...f,kind:'field',nullability:'required',cardinality:'one',extensions:{}};delete e.precision;delete e.scale;if(f.precision!==undefined)e.facets={...f.facets,precision:f.precision,scale:f.scale};return e;});
 return {umf:'0.6.0',id:'tuple',vocabularies:{future:{version:'1.0.0'}},extensions:{future:{native:['retained',null]}},modules:[{id:'m',namespace:'',elements:[{id:'record',kind:'record',members:fields.map(f=>({module:'m',element:f.id})),keys:[{id:'stable-key',name:'Key',fields:fields.map(f=>({module:'m',element:f.id}))}],extensions:{}},...elements]}]};
}
export function tupleCases(){
 const rows:any[]=[...vectors.vectors.map(v=>({id:v.id,document:tupleDocument(v.fields),values:v.values,hex:v.expectedHex})),...vectors.refusals.map(v=>({id:v.id,document:tupleDocument(v.fields),values:v.values,error:true}))];
 const add=(id:string,field:any,value:any,hex?:string)=>rows.push({id,document:tupleDocument([{id:'v',...field}]),values:[value],...(hex?{hex}:{error:true})});
 const int={scalarType:'integer'},dec={scalarType:'decimal',precision:5,scale:2},str={scalarType:'string'},bin={scalarType:'binary'};
 for(const token of ['-0','0.000e999999999999999999999999999999999999999','0e-99999999999999999999999999999999999'])add('zero-'+token,int,{integerToken:token},'554d464b3101020130');
 add('integer-exponent',int,{integerToken:'4.2e1'},'554d464b310102023432');
 add('integer-fraction-refusal',int,{integerToken:'4.2'});
 add('integer-host-number',int,{integerToken:9007199254740992});
 for(const token of ['01','+1','NaN','Infinity','1.',' 1','1e','0x10'])add('invalid-token-'+token,int,{integerToken:token});
 add('expansion-limit',int,{integerToken:'1e4000000'});
 add('large-negative-expansion',int,{integerToken:'1e-999999999999999999999999999999999999999'});
 add('decimal-exponent',dec,{decimalToken:'12e-1'},'554d464b3101030402313230');
 add('large-scale-exact-without-expansion',{scalarType:'decimal',precision:9007199254740991,scale:9007199254740991},{decimalToken:'1e-9007199254740991'},'554d464b31010309ffffffffffffff0f31');
 add('decimal-zero',dec,{decimalToken:'-0.00'},'554d464b310103020230');
 add('decimal-precision-boundary',dec,{decimalToken:'999.99'},'554d464b31010306023939393939');
 add('decimal-precision-overflow',dec,{decimalToken:'1000'});
 add('decimal-negative-exponent-rounding',dec,{decimalToken:'1e-3'});
 add('unpaired-high-surrogate',str,{string:'\ud800'});
 add('unpaired-low-surrogate',str,{string:'\udc00'});
 add('supplementary-scalar',{...str,facets:{length:{max:1,unit:'unicode-scalar'}}},{string:'😀'},'554d464b31010404f09f9880');
 add('supplementary-length-overflow',{...str,facets:{length:{max:1,unit:'unicode-scalar'}}},{string:'😀x'});
 add('binary-uppercase',bin,{binaryHex:'00FF'},'554d464b3101050200ff');
 add('binary-empty',bin,{binaryHex:''},'554d464b31010500');
 add('binary-odd',bin,{binaryHex:'f'});
 add('binary-nonhex',bin,{binaryHex:'gg'});
 add('binary-length-overflow',{...bin,facets:{length:{max:1,unit:'byte'}}},{binaryHex:'00ff'});
 add('boolean-false',{scalarType:'boolean'},{boolean:false},'554d464b3101010100');
 add('boolean-not-string',{scalarType:'boolean'},{boolean:'false'});
 add('null-component',str,null);
 add('wrong-wrapper',str,{integerToken:'1'});
 add('extra-wrapper',str,{string:'x',future:true});
 add('wide-metadata-no-power-allocation',{...int,facets:{integerWidth:{bits:9007199254740991,signed:true}}},{integerToken:'1'},'554d464b3101020131');
 add('signed-minimum',{...int,facets:{integerWidth:{bits:8,signed:true}}},{integerToken:'-128'},'554d464b310102042d313238');
 add('signed-maximum',{...int,facets:{integerWidth:{bits:8,signed:true}}},{integerToken:'127'},'554d464b31010203313237');
 for(const token of ['128','-129'])add('signed-overflow-'+token,{...int,facets:{integerWidth:{bits:8,signed:true}}},{integerToken:token});
 add('unsigned-max',{...int,facets:{integerWidth:{bits:8,signed:false}}},{integerToken:'255'},'554d464b31010203323535');
 for(const token of ['256','-1'])add('unsigned-overflow-'+token,{...int,facets:{integerWidth:{bits:8,signed:false}}},{integerToken:token});
 return rows;
}

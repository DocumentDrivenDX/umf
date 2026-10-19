import {buildAvroRelationshipCarrier,type AvroRelationshipCarrier} from '../../src/core-ideals/relationship-avro-carrier';
const base:AvroRelationshipCarrier={recordName:'Order',namespace:'sales',fieldName:'customer',keyRecordName:'CustomerKey',shape:'one',components:[{name:'id',type:'long'}]};
const rows:{id:string;request:AvroRelationshipCarrier;values:unknown[];expectedWrite:boolean;expectedValues:unknown[]}[]=[];
function add(id:string,patch:Partial<AvroRelationshipCarrier>,values:unknown[],expectedWrite=true,expectedValues=values){rows.push({id,request:{...base,...patch},values,expectedWrite,expectedValues});}
add('dangling-key-value',{},[{customer:{id:999}}]);
add('required-reference-missing',{},[{}],false);
add('singular-null-rejected',{},[{customer:null}],false);
add('nullable-reference',{shape:'nullable-one'},[{customer:null},{customer:{id:1}}]);
add('empty-reference-array',{shape:'array'},[{customer:[]}]);
add('duplicate-references',{shape:'array'},[{customer:[{id:1},{id:1}]}]);
add('composite-reference',{components:[{name:'tenant',type:'string'},{name:'id',type:'int'}]},[{customer:{tenant:'alpha',id:17}}]);
add('self-reference-key',{recordName:'Node',keyRecordName:'NodeKey',fieldName:'parent'},[{parent:{id:1}}]);
add('boolean-key',{components:[{name:'id',type:'boolean'}]},[{customer:{id:true}}]);
add('binary-key',{components:[{name:'id',type:'bytes'}]},[{customer:{id:{$bytes:'00ff'}}}]);
add('float-key-narrows',{components:[{name:'id',type:'float'}]},[{customer:{id:1.0000000000000002}}],true,[{customer:{id:1}}]);
add('double-key-preserves-probe',{components:[{name:'id',type:'double'}]},[{customer:{id:1.0000000000000002}}]);
await Bun.write('fixtures/avro/relationship-carrier-cases.json',JSON.stringify({scope:'Internal target-key tuple carrier probes; authored projection not yet implemented',cases:rows.map(r=>({...r,schemaText:buildAvroRelationshipCarrier(r.request)}))},null,2)+'\n');

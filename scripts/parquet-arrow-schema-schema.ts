export {};
const base=await Bun.file('spec/extensions/parquet/rename.schema.json').json();
const schema={
 $schema:base.$schema,$id:'urn:umf:parquet:arrow-schema:0.1.0',title:'Embedded Arrow schema observation',
 type:'object',additionalProperties:false,required:['source','status','complete','diagnostics'],
 properties:{
  source:base.properties.source,status:{enum:['absent','decoded','blocked']},complete:{const:false},
  diagnostics:base.properties.diagnostics,metadataIndex:{type:'integer',minimum:0},
  ipcHex:{type:'string',pattern:'^(?:[0-9a-f]{2})*(?![\\s\\S])'},message:base.properties.source,schema:base.properties.source,
 },
 allOf:[{
  if:{properties:{status:{const:'decoded'}}},
  then:{properties:{metadataIndex:{},ipcHex:{},message:{},schema:{}},required:['metadataIndex','ipcHex','message','schema']},
  else:{properties:{message:false,schema:false}}
 }],
};
await Bun.write('spec/extensions/parquet/arrow-schema.schema.json',JSON.stringify(schema,null,2)+'\n');

// Shared pinned native schema codec. The raw probe does not apply UMF export guards.
import {Schema,DataType,RecordBatchStreamWriter,RecordBatchReader} from 'apache-arrow';
import 'apache-arrow/ipc/metadata/message';
import {JSONTypeAssembler} from 'apache-arrow/visitor/jsontypeassembler';
const assembler=new JSONTypeAssembler();
function field(f:any):any{
 const dictionary=DataType.isDictionary(f.type)?f.type:undefined;const type=dictionary?.dictionary??f.type;
 return {name:f.name,nullable:f.nullable,type:assembler.visit(type),children:(type.children??[]).map(field),metadata:[...f.metadata].map(([key,value])=>({key,value})),...(dictionary?{dictionary:{id:dictionary.id,indexType:assembler.visit(dictionary.indices),isOrdered:dictionary.isOrdered}}:{})};
}
export function describe(schema:Schema){return {fields:schema.fields.map(field),metadata:[...schema.metadata].map(([key,value])=>({key,value}))};}
export function probe(input:unknown){
 const parsed=(Schema as any).fromJSON(input) as Schema;
 const before=describe(parsed);
 const bytes=new RecordBatchStreamWriter().reset(undefined,parsed).finish().toUint8Array(true);
 const reader=RecordBatchReader.from(bytes).open();
 const after=describe(reader.schema);
 return {before,after,bytes};
}

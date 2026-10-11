import {knownActionModel} from '../../src/extensions/actions/known-model';
import {actionFieldValueKey} from '../../src/extensions/actions/evaluation';
import type {ActionEntityInput} from '../../src/extensions/actions/selector';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../src/model/key-tuple';
import {UmfError,type Document} from '../../src/model/types';
import type {NativeReferenceEntity} from './state';
import {referenceAliasIdentity} from './state';
/** Exact core aliases, never business-Key allocation or approximate cross-Key equality. */
export function referenceEntityAliases(source:Document,entity:Pick<NativeReferenceEntity,'record'|'fields'>):{primary:boolean;entity:ActionEntityInput;tupleHex:string;identity:string}[]{
 const record=knownActionModel(source,entity.record,'record');return ((record.keys??[]) as {id:string;primary:boolean;fields:{module:string;element:string}[]}[]).map(key=>{
  if(key.fields.some(field=>!Object.hasOwn(entity.fields,actionFieldValueKey(field))||entity.fields[actionFieldValueKey(field)]===null))throw new UmfError('CONSTRAINT','Every native Key component must be present and typed');
  const input:ActionEntityInput={key:{...entity.record,key:key.id},components:key.fields.map(field=>entity.fields[actionFieldValueKey(field)]!)};
  try{const tupleHex=encodeCoreKeyTuple(source,input.key,input.components as CoreKeyTupleValue[]).bytesHex;return {primary:!!key.primary,entity:input,tupleHex,identity:referenceAliasIdentity(input,tupleHex)};}catch(error){if(error instanceof UmfError&&['KEY_TUPLE_VALUE','KEY_TUPLE_ABSENT','KEY_TUPLE_UNICODE','KEY_TUPLE_DOMAIN','KEY_TUPLE_TOKEN','KEY_TUPLE_ARITY','KEY_TUPLE_ROUNDING'].includes(error.code))throw new UmfError('CONSTRAINT','Every native Key component requires an admitted supplied value');throw error;}
 });
}

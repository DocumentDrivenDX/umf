// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../../src/model/types';
export const UUID='00112233-4455-6677-8899-aabbccddeeff';
export const HEX=UUID.replaceAll('-','');
export const FIELD={module:'m',element:'value'};
export const KEY={module:'m',element:'record',key:'id'};
export function uuidDocument(scalarType='uuid'):Document{return {umf:'0.10.0',id:'uuid-fixture',vocabularies:{},modules:[{id:'m',namespace:'test',elements:[{id:'record',kind:'record',members:[FIELD],keys:[{id:'id',name:'ID',fields:[FIELD]}],extensions:{}},{id:'value',kind:'field',cardinality:'one',nullability:'required',scalarType,extensions:{}}]}]};}
export function uuidBinding(kind='words64',signed=true):Document{
 const carrier=kind==='words64'?{kind,highColumn:'hi',lowColumn:'lo',signed}:{kind,column:'id'};
 return {umf:'0.10.0',id:'binding',vocabularies:{'umf.binding':{version:'0.3.0'}},modules:[],extensions:{'umf.binding':{profile:'umf-binding-3',logical:{documentId:'uuid-fixture',coreVersion:'0.10.0'},target:{system:'fixture',version:'1.0.0',subset:'carrier-codecs-only'},elements:[{module:'m',element:'record',table:'records'}],fields:[{...FIELD,storage:'scalar-carrier',carrier}],relationships:[],indexes:[]}}};
}

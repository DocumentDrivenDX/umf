// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {encodeCoreKeyTuple,verifyCoreKeyTuple,validateCoreDatasetValues,verifyCoreDatasetValues,inspectCoreEvolution,verifyCoreEvolution,selectCoreElements,selectCoreRelationships,UmfError,type Document,type CoreDatasetInput} from '../../src/index-node-v4';
const source:Document={umf:'0.10.0',id:'public-model',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements:[{id:'id',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},{id:'customer',kind:'record',members:[{module:'sales',element:'id'}],keys:[{id:'primary',name:'primary',primary:true,fields:[{module:'sales',element:'id'}]}],extensions:{}}]}]};
test('public model defaults invoke Rust tuple, dataset, evolution and metadata selection owners',()=>{
 const identity={module:'sales',element:'customer',key:'primary'};
 const tuple=encodeCoreKeyTuple(source,identity,[{string:'customer-1'}]);expect(verifyCoreKeyTuple(tuple,source)).toEqual(tuple);
 const input:CoreDatasetInput={scope:{id:'batch',closure:'supplied-dataset-only'},records:[{instanceId:'c1',identity:{module:'sales',element:'customer'},values:[{field:{module:'sales',element:'id'},state:'present',value:{string:'customer-1'}}]}],relationships:[]};
 const dataset=validateCoreDatasetValues(source,input);expect(dataset.datasetValidation.valid).toBe(true);expect(verifyCoreDatasetValues(dataset,source,input)).toEqual(dataset);
 const policy={profile:'core-0.8-absent-string-additions/0.1'} as const;
 const evolution=inspectCoreEvolution(source,source,policy);expect(verifyCoreEvolution(evolution,source,source,policy)).toEqual(evolution);
 expect(selectCoreElements(source,{references:'none',identities:[{module:'sales',element:'customer'}]}).selection).toHaveLength(1);
 expect(selectCoreRelationships(source,{}).selection).toEqual([]);
 expect(()=>encodeCoreKeyTuple(source,{...identity,key:'missing'},[{string:'customer-1'}])).toThrow(UmfError);
});

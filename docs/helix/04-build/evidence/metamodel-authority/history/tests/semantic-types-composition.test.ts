import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {createValidator} from '../../src/validation/schema';
import {validateDocument} from '../../src/validation/document';
import {readDocument,writeDocument} from '../../src/model/document';
import {copyJson} from '../../src/model/json';
import {selectCoreElements} from '../../src/model/selection';
import {inspectCoreSchemaProperties} from '../../src/model/schema-properties';
import {upgradeBit128Envelope} from '../../src/model/bit128-transition';
import {upgradeSemanticTypesEnvelope,rollbackSemanticTypesEnvelope,verifySemanticTypesTransition} from '../../src/model/semantic-types-transition';
import {declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration} from '../../src/model/semantic-types';
import reference from '../../spec/core/semantic-type-reference.schema.json';
import semantic from '../../spec/core/semantic-types-document.schema.json';
import selectionSchema from '../../spec/core/semantic-types-selection.schema.json';
import type {Document} from '../../src/model/types';
const term={vocabulary:'example.identity',version:'2026-10',term:'external-id'};
const uuid='01234567-89ab-cdef-8123-456789abcdef';
const identity={module:'m',element:'id'};
const clone=<T>(v:T):T=>copyJson(v) as unknown as T;
function original():Document{return {umf:'0.9.0',id:'exact-model',vocabularies:{native:{version:'9.1.0'}},modules:[{id:'m',namespace:'example',elements:[
 {id:'id',kind:'field',scalarType:'uuid',nullability:'required',cardinality:'one',examples:[{uuid}],allowedValues:[{uuid}],default:{value:{uuid},on:'missing'},extensions:{native:{original:'untouched'}}},
 {id:'bits',kind:'field',scalarType:'bits128',nullability:'required',cardinality:'one',examples:[{bits128Hex:'ffffffffffffffffffffffffffffffff'}],extensions:{}},
 {id:'record',kind:'record',members:[identity,{module:'m',element:'bits'}],keys:[{id:'pk',name:'primary',fields:[identity]}],extensions:{}}
 ]}]};}

// @covers US-090-AC1 @covers US-090-AC3 @covers US-090-AC4
test('core010 preserves UUID and bits128 constraints across explicit upgrade and edited rollback',()=>{
 const source=original();expect(validateDocument(source).valid).toBe(true);
 const upgrade=upgradeSemanticTypesEnvelope(source),authored=declareCoreSemanticTypes(upgrade.target,identity,[term]);
 expect(upgrade.target.umf).toBe('0.10.0');expect(authored.version).toBe('2.0.0');expect(upgrade.version).toBe('2.0.0');
 expect(validateDocument(authored.target).valid).toBe(true);
 for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(authored.target,format),format)).toEqual(authored.target);
 expect(rollbackSemanticTypesEnvelope(upgrade,authored.target).target).toEqual(source);
 expect(rollbackSemanticTypesEnvelope(upgrade,authored.target).source).toEqual(authored.target);
 for(const change of [
  (doc:Document)=>{doc.modules[0]!.elements[0]!.default={value:{uuid:'bad'},on:'missing'};},
  (doc:Document)=>{doc.modules[0]!.elements[0]!.allowedValues=[{uuid},{uuid:uuid.toUpperCase()}];},
  (doc:Document)=>{doc.modules[0]!.elements[1]!.examples=[{bits128Hex:'f'}];},
  (doc:Document)=>{doc.modules[0]!.elements[1]!.facets={length:{min:1,max:16,unit:'byte'}};}
 ]){
  const before=original(),after=clone(authored.target);change(before);change(after);
  expect(validateDocument(before).valid).toBe(false);expect(validateDocument(after).valid).toBe(false);
 }
});

// @covers US-090-AC1 @covers US-090-AC6
test('core010 selection retains member and Key traversal with composed typed literals',()=>{
 const source=declareCoreSemanticTypes(upgradeSemanticTypesEnvelope(original()).target,identity,[term]).target;
 const selected=selectCoreElements(source,{references:'transitive',identities:[{module:'m',element:'record'}],scalarTypes:['uuid','bits128']});
 // Filter categories combine with AND; a record is not a UUID Field.
 expect(selected.selection).toHaveLength(0);
 const all=selectCoreElements(source,{references:'transitive',identities:[{module:'m',element:'record'}]});
 expect(all.selection.map(row=>row.element.id)).toEqual(['id','bits','record']);expect(all.source).toEqual(source);
 const validator=createValidator();validator.addSchema(reference);validator.addSchema(semantic);const check=validator.compile(selectionSchema);
 const accepted=check(all);expect(check.errors??[]).toEqual([]);expect(accepted).toBe(true);
 const fields=selectCoreElements(source,{references:'none',scalarTypes:['uuid','bits128'],cardinalities:['one']});
 expect(fields.selection.map(row=>row.element.id)).toEqual(['id','bits']);
});

// @covers US-090-AC3 @covers US-090-AC5
test('older models require staged migration and opaque current090 semantic fields are archived',()=>{
 const old=original();old.umf='0.8.0';old.modules[0]!.elements=old.modules[0]!.elements.filter(e=>e.id==='id');old.modules[0]!.elements[0]!.scalarType='string';delete old.modules[0]!.elements[0]!.examples;delete old.modules[0]!.elements[0]!.allowedValues;delete old.modules[0]!.elements[0]!.default;
 expect(()=>upgradeSemanticTypesEnvelope(old)).toThrow('0.9.0');
 const v9=upgradeBit128Envelope(old,{collisions:[]}).target;v9.modules[0]!.elements[0]!.semanticTypes=[term];
 const v10=upgradeSemanticTypesEnvelope(v9);expect(v10.residuals[0]!.value).toEqual([term]);expect(v10.target.modules[0]!.elements[0]!.semanticTypes).toBeUndefined();
 expect(rollbackSemanticTypesEnvelope(v10,v10.target).target).toEqual(v9);
});

// @covers US-090-AC4 @covers US-090-AC5
test('historical semantic1 receipts and unexpanded authoring profiles refuse explicitly',()=>{
 const upgrade=upgradeSemanticTypesEnvelope(original()),declaration=declareCoreSemanticTypes(upgrade.target,identity,[term]);
 expect(()=>verifySemanticTypesTransition({...upgrade,version:'1.0.0'} as any)).toThrow();
 expect(()=>verifyCoreSemanticTypeDeclaration({...declaration,version:'1.0.0'} as any,declaration.target)).toThrow();
 expect(()=>inspectCoreSchemaProperties(declaration.target,{scope:'element',...identity})).toThrow();
 const old=original();old.modules[0]!.elements[0]!.semanticTypes=[term];expect(validateDocument(old).valid).toBe(true);expect(()=>declareCoreSemanticTypes(old,identity,[term])).toThrow('0.10.0');
});

// @covers US-090-AC5
test('published core090 UUID and prior schema bytes remain unchanged',async()=>{
 const baselines={"spec/core/bit128-document.schema.json": "d10476a91845c430df0852d8da9fa7b53a1700410109fec15e0c9954eec11c2b", "spec/core/key-tuple-operation-v4.schema.json": "90691e12c3edd982009124ea3d7a170d0f109bca76d388d5388bd2578ffaee0c", "spec/core/schema-properties-document.schema.json": "79e72f2ebef434c7d1e09d372c74d330b24109bb8af9778745a8d41275acee6e"};
 for(const [path,sha] of Object.entries(baselines))expect(createHash('sha256').update(await Bun.file(path).bytes()).digest('hex')).toBe(sha);
});

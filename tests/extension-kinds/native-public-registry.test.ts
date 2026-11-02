// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {Registry,UmfError,validateDocument,readDocument,writeDocument,jsonldRegistry} from '../../src/index-node-v4';
import type {Document,ExtensionPackage} from '../../src/model/types';
import minimal from '../../fixtures/core/minimal.json';

const manifest:ExtensionPackage={
 id:'example.native-registry',version:'1.0.0',coreVersion:'0.10.0',
 description:'Native registry baseline',semantics:'Caller-owned fixture callback',
 scopes:['document'],capabilities:{validation:'semantic',directions:[],evidence:[]},
 schema:{type:'object',required:['enabled'],properties:{enabled:{type:'boolean'}}},
};

test('default Registry admits packages and validates extension structure in Rust while preserving callbacks',()=>{
 let calls=0;
 const registry=new Registry().register(manifest,(payload,context)=>{
  calls++;expect(context.path).toBe('/extensions/example.native-registry');
  return [{code:'FIXTURE_CALLBACK',path:context.path,message:'Caller callback ran',severity:'warning'}];
 });
 const structure=registry.get(manifest.id,manifest.version)!.structure;
 expect(structure({enabled:true})).toBe(true);
 expect(structure.errors).toBeNull();
 expect(structure({enabled:'incorrect'})).toBe(false);
 expect(structure.errors?.[0]).toMatchObject({instancePath:'/enabled',keyword:'type'});
 const yaml=readDocument('umf: 0.10.0\nid: native-roundtrip\nvocabularies: {}\nmodules: []\nfuture:\n  token: "9007199254740993"\n');
 expect(readDocument(writeDocument(yaml))).toEqual(yaml);
 expect(()=>readDocument('umf: invalid\n')).toThrow(UmfError);
 const document=structuredClone(minimal) as Document;
 document.vocabularies[manifest.id]={version:manifest.version};
 document.extensions={[manifest.id]:{enabled:true,future:{token:'9007199254740993'}}};
 const valid=validateDocument(document,registry);
 expect(valid.valid).toBe(true);
 expect(valid.diagnostics.some(d=>d.code==='FIXTURE_CALLBACK')).toBe(true);
 expect(calls).toBe(1);
 expect(document.extensions[manifest.id]).toEqual({enabled:true,future:{token:'9007199254740993'}});
 const invalid=structuredClone(document);
 invalid.extensions![manifest.id]={enabled:'incorrect'};
 expect(validateDocument(invalid,registry).valid).toBe(false);
 const bad=new Registry();
 expect(()=>bad.register({...manifest,scopes:['invalid' as never]})).toThrow(UmfError);
 expect(bad.registrations()).toEqual([]);
 expect(jsonldRegistry().kindRuntime).toBeDefined();
},60_000);

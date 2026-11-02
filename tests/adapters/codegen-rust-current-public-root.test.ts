import {describe, expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {discoverTableMigrationChanges, normalizeRowScope, reviewedValueDigest, UmfError} from '../../src/index-node-v4';

const operations=JSON.parse(readFileSync(new URL('../rust-core/fixtures/r3/baseline/operations.json',import.meta.url),'utf8')) as any;
const caseById=(id:string)=>operations.cases.find((item:any)=>item.id===id)!;

describe('native current codegen public operations',()=>{
  test('discovery 0.3 includes operation candidates while 0.2 stays closed',()=>{
    const request=caseById('migration/command-only-revision').request;
    const legacy=discoverTableMigrationChanges(request.previous,request.next,{version:'umf.table-migration-discovery/0.2'} as any);
    expect(legacy.some((item:any)=>item.kind==='change-operation')).toBe(false);
    const selected=discoverTableMigrationChanges(request.previous,request.next,{version:'umf.table-migration-discovery/0.3'} as any);
    expect(selected.some((item:any)=>item.kind==='change-operation')).toBe(true);
    const operationIndex=selected.findIndex((item:any)=>item.kind==='change-operation'||item.kind==='change-operation-context');
    expect(operationIndex).toBeGreaterThanOrEqual(0);
    expect(selected.slice(operationIndex).every((item:any)=>item.kind==='change-operation'||item.kind==='change-operation-context')).toBe(true);
  },60_000);

  test('row-scope admission runs outside native preparation and preserves refusal',()=>{
    const request=caseById('row-scope/supplied-owner-via-group-batch').request;
    const context={...request.context,admitPolicy:()=>[]};
    const accepted=normalizeRowScope(request.input,context);
    expect(accepted.valid).toBe(true);
    expect(accepted.policy).toBeDefined();
    const refused=normalizeRowScope(request.input,{...request.context,admitPolicy:()=>[
      {code:'HOST_POLICY',path:'/policy',message:'Host policy refused'},
    ]});
    expect(refused.valid).toBe(false);
    expect(refused.policy).toBeUndefined();
    expect(refused.diagnostics.some(item=>item.code==='HOST_POLICY')).toBe(true);
  },60_000);

  test('malformed selector is reported through the public UMF error class',()=>{
    const request=caseById('migration/command-only-revision').request;
    try {
      discoverTableMigrationChanges(request.previous,request.next,{version:'umf.table-migration-discovery/0.9'} as any);
      throw new Error('Expected selector refusal');
    } catch(error) {
      expect(error).toBeInstanceOf(UmfError);
      expect((error as UmfError).code).toBe('MIGRATION_CHANGES_FAILED');
    }
  },30_000);
});


describe('native reviewed value digest public operation',()=>{
  test('matches canonical digest for values and undefined root normalization',()=>{
    expect(reviewedValueDigest(undefined)).toBe('74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b');
    expect(reviewedValueDigest({b:2,a:1})).toBe('43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
  },60_000);
  test('refuses values that cannot be represented as canonical JSON',()=>{
    const cyclic:any={};cyclic.self=cyclic;
    expect(()=>reviewedValueDigest(cyclic)).toThrow();
  });
});

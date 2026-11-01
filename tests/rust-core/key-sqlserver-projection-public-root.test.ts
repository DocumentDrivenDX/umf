import {expect,test} from 'bun:test';
import {sqlserverKeyAuthors} from '../../scripts/core-ideals/key-sqlserver-projection-cases';
import {projectKeysToSqlServer,verifyKeysSqlServerProjection,recoverKeysSqlServerIdeal} from '../../src/index-node-v4';

test('V4 Rust SQL Server key projection preserves authored identity through recovery and strict refusal',()=>{
 const input=sqlserverKeyAuthors(),result=projectKeysToSqlServer(input.source,input.authors,input.request);
 expect(result.status).toBe('projected');
 expect(result.mappings.map(x=>x.keyId)).toEqual(['stable-id','stable-code']);
 expect(result.nativeSql).toContain('CONSTRAINT [order_identity] PRIMARY KEY NONCLUSTERED ([order_id])');
 expect(result.nativeSql).toContain('CONSTRAINT [external_identity] UNIQUE NONCLUSTERED ([code_bytes], [code_length])');
 const current=result.target!;
 expect(verifyKeysSqlServerProjection(result,current)).toEqual(result);
 expect(recoverKeysSqlServerIdeal(result,current)).toEqual(input.source);
 const strict=projectKeysToSqlServer(input.source,input.authors,{...input.request,mode:'strict'});
 expect(strict.status).toBe('blocked');
 expect(strict.mappings).toHaveLength(input.authors.length);
 expect(strict.target).toBeUndefined();
});

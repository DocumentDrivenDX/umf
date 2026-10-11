import {expect,test} from 'bun:test';
import {lowerSecurityQueryCarrierDomains} from '../packages/postgresql/src/security-query-carrier-domains';
const original=()=>({schema:'security_raw',table:'source',fields:[{column:'id',family:'string' as const},{column:'salary',family:'integer' as const}]});
test('native query domains retain exact text/int64 descriptors',()=>{
 const sql=lowerSecurityQueryCarrierDomains(original());expect(sql).toContain('pg_catalog.text');expect(sql).toContain('pg_catalog.int8');expect(sql).toContain('NOT a.attisdropped');expect(sql).toContain('pg_catalog.to_regclass');
});
test('incomplete, duplicate and unsupported native field domains refuse',()=>{
 for(const fields of [[],[...original().fields,original().fields[0]!],[{column:'salary',family:'number'}]])expect(()=>lowerSecurityQueryCarrierDomains({...original(),fields} as any)).toThrow('TRUSS_SECURITY_QUERY_CARRIER_UNSUPPORTED');
 for(const table of ['', 'x\0y','x'.repeat(64),'\ud800'])expect(()=>lowerSecurityQueryCarrierDomains({...original(),table})).toThrow();
});
test('native relation and column identity is escaped rather than interpreted',()=>{
 const sql=lowerSecurityQueryCarrierDomains({schema:'q"uote',table:"x'\\y",fields:[{column:"x'\\y",family:'string'}]});expect(sql).toContain('"q""uote"');expect(sql).toContain("x\\'\\\\y");
});

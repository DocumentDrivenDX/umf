import {test,expect} from 'bun:test';
import * as u from '../src/index';
import {uuidDocument} from './helpers/uuid-fixtures';
test('explicit collision adoption, exact rollback and unrelated unknown preservation',()=>{
 const old=uuidDocument();old.umf='0.8.0';delete old.modules[0]!.elements[0]!.keys;
 expect(()=>u.upgradeBit128Envelope(old,{collisions:[]})).toThrow();
 const path='/modules/0/elements/1/scalarType';const options={collisions:[{path,expected:'uuid',replacement:'uuid'}]};
 const receipt=u.upgradeBit128Envelope(old,options);expect(receipt.target.umf).toBe('0.9.0');expect(u.rollbackBit128Envelope(receipt,receipt.target)).toEqual({restored:old,later:receipt.target});
 expect(()=>u.upgradeBit128Envelope(old,{collisions:[{path,expected:'string',replacement:'uuid'}]})).toThrow();
 expect(()=>u.upgradeBit128Envelope(old,{collisions:[...options.collisions,...options.collisions]})).toThrow();
 const stale=structuredClone(receipt.target);stale.id='later';expect(()=>u.rollbackBit128Envelope(receipt,stale)).toThrow();
 const forged=structuredClone(receipt);forged.source.id='forged';expect(()=>u.rollbackBit128Envelope(forged,receipt.target)).toThrow();
});
test('structural source with unknown UUID key equality can be adopted explicitly, without adopting unrelated errors',()=>{
 const old=uuidDocument();old.umf='0.8.0';expect(u.validateDocument(old).valid).toBe(false);
 const options={collisions:[{path:'/modules/0/elements/1/scalarType',expected:'uuid',replacement:'uuid'}]};
 const r=u.upgradeBit128Envelope(old,options);expect(u.validateDocument(r.target).valid).toBe(true);expect(u.rollbackBit128Envelope(r,r.target).restored).toEqual(old);
 const invalid=structuredClone(old);invalid.modules[0]!.elements[0]!.members=[{module:'m',element:'missing'}];expect(()=>u.upgradeBit128Envelope(invalid,options)).toThrow();
});

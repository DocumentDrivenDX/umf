// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {SecurityAuthorityGuard} from '../../src/index-node-v4';
import {UmfError} from '../../src/model/errors';

test('Node V4 authority guard reads retained generations and commits one native transition',async()=>{
 const guard=new SecurityAuthorityGuard('g1');
 expect(await guard.read(async generation=>generation)).toBe('g1');
 await guard.change('g2',async()=>{});
 expect(await guard.read(async generation=>generation)).toBe('g2');
 let called=false;
 await expect(guard.change('g2',async()=>{called=true;})).rejects.toMatchObject({name:UmfError.name,code:'SECURITY_GUARD_REFUSED'});
 expect(called).toBe(false);
});

test('Node V4 authority guard closes on an uncertain transition outcome',async()=>{
 const guard=new SecurityAuthorityGuard('before');
 await expect(guard.change('uncertain',async()=>{throw new Error('commit acknowledgement lost');})).rejects.toMatchObject({name:UmfError.name,code:'SECURITY_TRANSITION_UNKNOWN'});
 await expect(guard.read(async generation=>generation)).rejects.toMatchObject({name:UmfError.name,code:'SECURITY_GUARD_REFUSED'});
});

test('Node V4 authority guard preserves close during an active change as uncertain',async()=>{
 const guard=new SecurityAuthorityGuard('before');
 let started!:()=>void;let settle!:()=>void;
 const running=guard.change('next',async()=>{
  started();
  await new Promise<void>(resolve=>{settle=resolve;});
 });
 await new Promise<void>(resolve=>{started=resolve;});
 guard.close();
 settle();
 await expect(running).rejects.toMatchObject({name:UmfError.name,code:'SECURITY_TRANSITION_UNKNOWN'});
});

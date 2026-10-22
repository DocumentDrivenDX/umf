import {test,expect} from 'bun:test';
import {SecurityAuthorityGuard} from '../../src/extensions/security/authority-guard';
const barrier=()=>{let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);return {wait,release};};

// @covers US-057-AC2
// @covers US-057-AC3
test('revocation drains prior final releases and later readers observe the new generation',async()=>{
  const guard=new SecurityAuthorityGuard('g1'),entered=barrier(),finalRelease=barrier(),changeEntered=barrier(),commit=barrier();
  const events:string[]=[];
  const first=guard.read(async generation=>{events.push('read:'+generation);entered.release();await finalRelease.wait;events.push('released');});
  await entered.wait;
  const revoke=guard.change('g2',async()=>{events.push('change');changeEntered.release();await commit.wait;events.push('commit');}).then(()=>events.push('ack'));
  const next=guard.read(async generation=>{events.push('next:'+generation);});
  await Promise.resolve();expect(events).toEqual(['read:g1']);
  finalRelease.release();await first;await changeEntered.wait;expect(events).toEqual(['read:g1','released','change']);
  commit.release();await Promise.all([revoke,next]);
  expect(events.indexOf('next:g2')).toBeGreaterThan(events.indexOf('commit'));
  expect(events.indexOf('ack')).toBeGreaterThan(events.indexOf('released'));
});

// @covers US-057-AC2
// @covers US-057-AC7
test('active cancellation cannot release the guard while application buffers remain live',async()=>{
  const guard=new SecurityAuthorityGuard('g1'),entered=barrier(),buffersReleased=barrier(),controller=new AbortController();let changed=false;
  const reader=guard.read(async()=>{entered.release();await buffersReleased.wait;},controller.signal);
  await entered.wait;controller.abort();
  const revoke=guard.change('g2',async()=>{changed=true;});await Promise.resolve();expect(changed).toBe(false);
  buffersReleased.release();await Promise.all([reader,revoke]);expect(changed).toBe(true);
});

// @covers US-057-AC7
test('queued cancellation never invokes the producer or cancels a still active reader',async()=>{
  const guard=new SecurityAuthorityGuard('g1'),entered=barrier(),release=barrier(),controller=new AbortController();let called=false;
  const reader=guard.read(async()=>{entered.release();await release.wait;});await entered.wait;
  const canceled=guard.change('g2',async()=>{called=true;},controller.signal).catch(error=>error.code);
  controller.abort();expect(await canceled).toBe('SECURITY_GUARD_REFUSED');expect(called).toBe(false);
  release.release();await reader;expect(await guard.read(async generation=>generation)).toBe('g1');
});

// @covers US-057-AC7
// @covers US-057-AC8
test('unknown transition outcomes close admission and cannot acknowledge a fresh generation',async()=>{
  const guard=new SecurityAuthorityGuard('g1'),entered=barrier(),fail=barrier();
  const change=guard.change('g2',async()=>{entered.release();await fail.wait;throw new Error('Unknown native commit');}).catch(error=>error.code);
  await entered.wait;const queued=guard.read(async()=>true).catch(error=>error.code);
  fail.release();expect(await change).toBe('SECURITY_TRANSITION_UNKNOWN');expect(await queued).toBe('SECURITY_GUARD_REFUSED');
  expect(await guard.read(async()=>true).catch(error=>error.code)).toBe('SECURITY_GUARD_REFUSED');
});

// @covers US-057-AC3
test('generation reuse refuses before effects and preserves the current generation',async()=>{
  const guard=new SecurityAuthorityGuard('g1');let called=false;
  await guard.change('g2',async()=>{});
  expect(await guard.change('g1',async()=>{called=true;}).catch(error=>error.code)).toBe('SECURITY_GUARD_REFUSED');
  expect(called).toBe(false);expect(await guard.read(async generation=>generation)).toBe('g2');
});

// @covers US-057-AC7
test('close before an acquired producer starts prevents effects',async()=>{
  const guard=new SecurityAuthorityGuard('g1');let called=false;
  const operation=guard.read(async()=>{called=true;}).catch(error=>error.code);
  guard.close();expect(await operation).toBe('SECURITY_GUARD_REFUSED');expect(called).toBe(false);
});

// @covers US-057-AC7
test('resource bounds refuse excess admission without invoking the producer',async()=>{
  const guard=new SecurityAuthorityGuard('g1'),release=barrier();let called=false;
  const readers=Array.from({length:256},()=>guard.read(async()=>{await release.wait;}));
  expect(await guard.read(async()=>{called=true;}).catch(error=>error.code)).toBe('SECURITY_GUARD_REFUSED');
  expect(called).toBe(false);release.release();await Promise.all(readers);
  expect(await guard.read(async generation=>generation)).toBe('g1');
});

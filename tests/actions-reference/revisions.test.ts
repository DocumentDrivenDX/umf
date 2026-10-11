import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceRevisionRepository} from '../../scripts/actions-reference/revisions';
import {withReferenceStore} from './native-harness';
test('native revision retention preserves original source across retirement and refuses replacement',async()=>{
 await withReferenceStore(async store=>{
  await store.create('s','tenant','epoch');const repository=new ReferenceRevisionRepository(store),target={module:'sales',action:'approve',revision:'r1'};
  const source=structuredClone(fixture) as unknown as Document;
  const id=await repository.retain('s',target,source,{build:'qualification-1'});
  expect((await repository.read('s',target)).id).toBe(id);
  await store.transaction('s',async(tx,control)=>{const pinned=await repository.readInTransaction(tx,control,target);expect(pinned.id).toBe(id);expect(pinned.lifecycle).toBe('active');});
  let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),hold=new Promise<void>(resolve=>release=resolve);
  const locked=store.transaction('s',async()=>{entered();await hold;});await ready;
  const mutable={...target},pending=repository.read('s',mutable);mutable.revision='r2';
  try{let blocked=false;for(let i=0;i<100;i++){const rows=await store.sql`select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock'`;if(rows.length){blocked=true;break;}await Bun.sleep(10);}expect(blocked).toBe(true);}finally{release();}
  await locked;expect((await pending).target.revision).toBe('r1');
  await repository.lifecycle('s',target,'retired');const retained=await repository.read('s',target);
  expect(retained.lifecycle).toBe('retired');expect(retained.source).toEqual(source);expect(retained.deployment).toEqual({build:'qualification-1'});
  await expect(repository.retain('s',target,source)).rejects.toThrow('duplicate exact native identity');
  await expect(store.transaction('s',async tx=>{await tx`update action_revision set source='{}' where id=${id}`;})).rejects.toThrow('immutable revision source');
  await repository.lifecycle('s',target,'unavailable');expect((await repository.read('s',target)).source).toEqual(source);
  await expect(repository.read('s',{...target,revision:'absent'})).rejects.toThrow();
 });
},60000);

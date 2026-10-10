import {UmfError} from '../../model/types';

type Mode='read'|'change';
interface Waiter {mode:Mode;resolve:()=>void;reject:(error:UmfError)=>void;signal?:AbortSignal;abort?:()=>void}
const refused=()=>new UmfError('SECURITY_GUARD_REFUSED','Authority guard unavailable');

/** Single-realm coordination only. Hosts must prove all native writers and final releases participate. */
export class SecurityAuthorityGuard {
  #generation:string;
  #seen:Set<string>;
  #readers=0;
  #changing=false;
  #closed=false;
  #queue:Waiter[]=[];
  constructor(generation:string){
    if(typeof generation!=='string'||!generation.length||generation.length>4096)throw refused();
    this.#generation=generation;this.#seen=new Set([generation]);
  }
  async read<T>(operation:(generation:string)=>Promise<T>,signal?:AbortSignal):Promise<T>{
    await this.#acquire('read',signal);
    try{if(this.#closed)throw refused();return await operation(this.#generation);}
    finally{this.#readers--;this.#drain();}
  }
  /** A change callback must commit its complete authority transaction before resolving. */
  async change(generation:string,operation:()=>Promise<void>,signal?:AbortSignal):Promise<void>{
    if(typeof generation!=='string'||!generation.length||generation.length>4096)throw refused();
    await this.#acquire('change',signal);
    try{
      if(this.#closed||this.#seen.has(generation)||this.#seen.size>=1024)throw refused();
      try{
        await operation();
        if(this.#closed)throw refused();
        this.#generation=generation;this.#seen.add(generation);
      }catch{
        // A thrown producer may have committed. Never reuse a possibly stale generation.
        this.close();throw new UmfError('SECURITY_TRANSITION_UNKNOWN','Authority transition outcome unavailable');
      }
    }finally{this.#changing=false;this.#drain();}
  }
  /** Closing refuses new/queued work; active callbacks retain their guard until they settle. */
  close():void{
    this.#closed=true;
    for(const waiter of this.#queue.splice(0)){this.#unlisten(waiter);waiter.reject(refused());}
  }
  #acquire(mode:Mode,signal?:AbortSignal):Promise<void>{
    if(this.#closed||signal?.aborted||this.#queue.length+this.#readers+Number(this.#changing)>=256)
      return Promise.reject(refused());
    return new Promise((resolve,reject)=>{
      const waiter:Waiter={mode,resolve,reject,...(signal?{signal}:{})};
      if(signal){
        waiter.abort=()=>{
          const index=this.#queue.indexOf(waiter);
          if(index>=0){this.#queue.splice(index,1);this.#unlisten(waiter);reject(refused());this.#drain();}
        };
        signal.addEventListener('abort',waiter.abort,{once:true});
      }
      this.#queue.push(waiter);this.#drain();
    });
  }
  #unlisten(waiter:Waiter):void{if(waiter.signal&&waiter.abort)waiter.signal.removeEventListener('abort',waiter.abort);}
  #drain():void{
    if(this.#closed||this.#changing)return;
    while(this.#queue.length){
      const first=this.#queue[0]!;
      if(first.mode==='change'&&this.#readers)return;
      this.#queue.shift();this.#unlisten(first);
      if(first.mode==='change'){this.#changing=true;first.resolve();return;}
      this.#readers++;first.resolve();
    }
  }
}

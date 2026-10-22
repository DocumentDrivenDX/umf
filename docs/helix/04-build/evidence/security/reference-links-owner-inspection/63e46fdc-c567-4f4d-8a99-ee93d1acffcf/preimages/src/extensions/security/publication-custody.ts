import {copyJson} from '../../model/json';
import {UmfError,type Json} from '../../model/types';

/** In-process capability only; not a database credential. */
export interface SecurityPublicationBuffer {readonly kind:'security-publication-buffer'}
type State='open'|'sealed'|'retiring'|'retired'|'unknown';
interface BufferRecord {payload:Json;delivering:boolean}
const refused=()=>new UmfError('SECURITY_PUBLICATION_REFUSED','Publication custody unavailable');

/** Trusted host component. Covers only buffers routed through this instance.
 * Consumer resolution must mean the declared final release; arbitrary copies,
 * process recovery, native issuer authentication and writer closure are host obligations.
 */
export class SecurityPublicationCustody {
  #state:State='open';
  #retaining=false;
  #buffers=new Map<SecurityPublicationBuffer,BufferRecord>();
  #retireNative:()=>Promise<void>;
  constructor(retireNative:()=>Promise<void>){
    if(typeof retireNative!=='function')throw refused();
    this.#retireNative=retireNative;
  }
  retain(payload:unknown):SecurityPublicationBuffer {
    if(this.#retaining||this.#state!=='open'||this.#buffers.size>=128)throw refused();
    // Copy without executing accessors or accepting opaque native objects.
    let owned:Json;
    this.#retaining=true;
    try{owned=copyJson(payload);}finally{this.#retaining=false;}
    if(this.#state!=='open'||this.#buffers.size>=128)throw refused();
    const handle=Object.freeze({kind:'security-publication-buffer' as const});
    this.#buffers.set(handle,{payload:owned,delivering:false});return handle;
  }
  /** Prevent further retention before assessing complete local drain. */
  seal():void{if(this.#retaining||this.#state!=='open')throw refused();this.#state='sealed';}
  async consume(handle:SecurityPublicationBuffer,consumer:(payload:Json)=>Promise<void>):Promise<void>{
    const buffer=this.#buffers.get(handle);
    if(!buffer||buffer.delivering||!['open','sealed'].includes(this.#state)||typeof consumer!=='function')throw refused();
    buffer.delivering=true;
    try{
      await consumer(buffer.payload);
      // Another failed consumer may have quarantined the whole publisher.
      this.#buffers.delete(handle);
    }catch{
      this.#state='unknown';throw new UmfError('SECURITY_PUBLICATION_UNKNOWN','Publication release outcome unavailable');
    }
  }
  discard(handle:SecurityPublicationBuffer):void{
    const buffer=this.#buffers.get(handle);
    if(!buffer||buffer.delivering||!['open','sealed'].includes(this.#state))throw refused();
    this.#buffers.delete(handle);
  }
  /** Backend loss and transaction rollback never dispose host buffers. */
  backendLost():void{}
  async retire():Promise<void>{
    if(this.#state!=='sealed'||this.#buffers.size)throw refused();
    this.#state='retiring';
    try{await this.#retireNative();this.#state='retired';}
    catch{this.#state='unknown';throw new UmfError('SECURITY_PUBLICATION_UNKNOWN','Native retirement outcome unavailable');}
  }
}

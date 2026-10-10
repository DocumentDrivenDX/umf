import {createValidator} from '../../src/validation/schema';
import {generateLoaderInventorySchema} from '../../src/domain-packs/loader-inventory';
import {readJsonValue} from '../../src/model/serialization';
export type Profile='documents'|'court-documents'|'sec-filings';
export type Rights='local-use'|'redistribute';
export interface Entry {expected_sha256?:string;id:string;url:string;media_type:string;license:{redistribution:'allowed'|'restricted'|'unknown';[key:string]:unknown};metadata?:Record<string,unknown>;[key:string]:unknown}
export interface Inventory {version:'1.0.0';id:string;allowed_hosts:string[];request_interval_ms:number;max_bytes:number;max_total_bytes:number;max_documents:number;timeout_ms:number;retries:number;entries:Entry[];[key:string]:unknown}
const validate=createValidator().compile(generateLoaderInventorySchema());
export function parseInventory(text:string,profile:Profile,rights:Rights):Inventory {
 const value=readJsonValue(text,'json');
 if(!validate(value))throw Error('INVENTORY_STRUCTURE');
 const inv=value as unknown as Inventory;
 if(inv.entries.length>inv.max_documents||new Set(inv.entries.map(e=>e.id)).size!==inv.entries.length)throw Error('INVENTORY_IDENTITIES_OR_LIMIT');
 for(const host of inv.allowed_hosts)if(!validHost(host))throw Error('INVALID_HOST');
 if(profile==='sec-filings'&&(inv.request_interval_ms<1000||inv.allowed_hosts.some(h=>!['www.sec.gov','data.sec.gov'].includes(h))))throw Error('SEC_POLICY');
 for(const e of inv.entries){
  validateUrl(e.url,inv.allowed_hosts);
  if(profile==='court-documents'&&e.media_type!=='application/pdf')throw Error('COURT_MEDIA');
  if(e.license.redistribution==='restricted'||(rights==='redistribute'&&e.license.redistribution!=='allowed'))throw Error('SOURCE_RIGHTS');
 }
 return inv;
}
function validHost(h:string){return h===h.toLowerCase()&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(h)&&h.includes('.')&&!/^[0-9.]+$/.test(h)&&!h.endsWith('.localhost')&&!h.endsWith('.local')&&!h.endsWith('.internal')&&!h.includes('..');}
export function validateUrl(value:string,hosts:string[]) {
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port||!validHost(u.hostname)||!hosts.includes(u.hostname))throw Error('SOURCE_URL_POLICY');
}

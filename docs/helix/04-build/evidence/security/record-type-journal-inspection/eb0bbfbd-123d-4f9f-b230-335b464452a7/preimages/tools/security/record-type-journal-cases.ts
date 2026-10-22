import {inspectCoreRecordTypeJournal,type CoreRecordTypeJournalEvent} from '../../src/model/record-type-journal';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {declareCoreRecordType} from '../../src/model/record-type';
import {inspectCoreRecordTypeReceipt} from '../../src/model/record-type-inspection';
import {copyJson} from '../../src/model/json';
import {UmfError,type Document} from '../../src/model/types';
export function journalFixture(){
 const base:Document={umf:'0.7.0',id:'journal',vocabularies:{},modules:[{id:'m',namespace:'m',elements:[{id:'v',extensions:{},references:[{role:'future-role',module:'other',element:'R','future/qualifier':{values:['b','a']}}],'future/field':{values:['b','a']}},{id:'w',extensions:{}}]},{id:'other',namespace:'other',elements:[{id:'R',extensions:{}},{id:'v',kind:'field',extensions:{}}]}]};
 const field=declareCoreElementKind(base,{module:'m',element:'v'},'field'),record=declareCoreElementKind(field.target,{module:'other',element:'R'},'record');
 const first=declareCoreRecordType(declareCoreElementKind(record.target,{module:'m',element:'v'},'field'),record);
 const secondField=declareCoreElementKind(first.target,{module:'m',element:'w'},'field'),secondRecord=declareCoreElementKind(secondField.target,{module:'other',element:'R'},'record');
 const second=declareCoreRecordType(secondField,secondRecord);
 return {base,current:second.target,events:[field,record,first,secondField,second] as CoreRecordTypeJournalEvent[]};
}
export function runRecordTypeJournalCases(){
 const rows:{id:string;passed:true}[]=[];function check(id:string,value:boolean){if(!value)throw Error(id);rows.push({id,passed:true})}
 function refuses(id:string,fn:()=>unknown,code?:string){let failure:unknown;try{fn()}catch(e){failure=e}check(id,failure instanceof UmfError&&(!code||failure.code===code))}
 const f=journalFixture(),result=inspectCoreRecordTypeJournal(f.base,f.current,f.events);
 check('two typed Fields reconciled',result.types.length===2);
 check('ordered event indices retained',JSON.stringify(result.types.map(t=>t.eventIndex))==='[2,4]');
 check('exact appended original paths retained',JSON.stringify(result.types.map(t=>t.path))==='["/modules/0/elements/0/references/1","/modules/0/elements/1/references/0"]');
 check('qualified same-name Record resolution',result.types.every(t=>t.link.target.path==='/modules/1/elements/0'&&t.link.target.identity.module==='other'));
 check('generic links do not become authority',result.types.every(t=>t.link.typeAssertion==='unverified')&&result.issuerAuthority==='unverified'&&result.enforcement==='none');
 check('opaque earlier references preserved',JSON.stringify(result.source.modules[0]!.elements[0]!.references![0])===JSON.stringify(f.base.modules[0]!.elements[0]!.references![0]));
 check('complete receipts retained',JSON.stringify(result.events)===JSON.stringify(f.events));
 check('base missing kinds retained',!Object.hasOwn(result.base.modules[0]!.elements[0]!,'kind'));
 refuses('old exact-current receipt stays stale',()=>inspectCoreRecordTypeReceipt(f.current,{module:'m',element:'v'},f.events[2] as any),'CORE_RECORD_TYPE_STALE');
 const only=inspectCoreRecordTypeJournal(f.base,f.events[1]!.target,f.events.slice(0,2));check('kind-only journal grants no imported types',only.types.length===0);
 const idle=declareCoreElementKind(f.current,{module:'m',element:'w'},'field');check('idempotent events remain explicit',inspectCoreRecordTypeJournal(f.base,idle.target,[...f.events,idle,idle]).events.length===7);
 const ordered=(x:any):any=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).reverse().map(k=>[k,ordered(x[k])])):x;
 check('object key ordering is immaterial',inspectCoreRecordTypeJournal(ordered(f.base),ordered(f.current),ordered(f.events)).types.length===2);
 refuses('empty journal',()=>inspectCoreRecordTypeJournal(f.base,f.current,[]),'CORE_TYPE_JOURNAL_CAPACITY');
 refuses('excessive journal',()=>inspectCoreRecordTypeJournal(f.base,f.current,Array(33).fill(f.events[0])),'CORE_TYPE_JOURNAL_CAPACITY');
 refuses('omitted kind event',()=>inspectCoreRecordTypeJournal(f.base,f.current,f.events.slice(1)),'CORE_TYPE_JOURNAL_GAP');
 refuses('omitted type transition',()=>inspectCoreRecordTypeJournal(f.base,f.current,f.events.filter((_,i)=>i!==2)),'CORE_TYPE_JOURNAL_GAP');
 refuses('reordered events',()=>inspectCoreRecordTypeJournal(f.base,f.current,[f.events[1]!,f.events[0]!,...f.events.slice(2)]),'CORE_TYPE_JOURNAL_GAP');
 refuses('duplicated mutating type event',()=>inspectCoreRecordTypeJournal(f.base,f.current,[...f.events.slice(0,3),f.events[2]!,...f.events.slice(3)]),'CORE_TYPE_JOURNAL_GAP');
 refuses('partial prefix cannot claim final source',()=>inspectCoreRecordTypeJournal(f.base,f.current,f.events.slice(0,3)),'CORE_TYPE_JOURNAL_CURRENT');
 const context=structuredClone(f.current);context.id='changed';refuses('unrelated final context change',()=>inspectCoreRecordTypeJournal(f.base,context,f.events),'CORE_TYPE_JOURNAL_CURRENT');
 const changedBase=structuredClone(f.base);changedBase.id='changed';refuses('unrelated base context change',()=>inspectCoreRecordTypeJournal(changedBase,f.current,f.events),'CORE_TYPE_JOURNAL_GAP');
 const opaque=structuredClone(f.current);(opaque.modules[0]!.elements[0]!['future/field'] as any).values.reverse();refuses('opaque value order change',()=>inspectCoreRecordTypeJournal(f.base,opaque,f.events),'CORE_TYPE_JOURNAL_CURRENT');
 for(const [id,mutate] of [
  ['forged event source',(e:any)=>{e[2].source.id='changed'}],['forged author source',(e:any)=>{e[2].fieldAuthor.source.id='changed'}],['forged reference',(e:any)=>{e[2].reference.module='m'}],['forged pointer',(e:any)=>{e[2].provenance.idealPath='/modules/0/elements/0/references/0'}],['forged authority',(e:any)=>{e[2].issuerAuthority='verified'}],['unsupported receipt version',(e:any)=>{e[2].version='5.0.0'}],['unsupported event',(e:any)=>{e[2].operation='arbitrary-edit'}],
 ] as [string,(e:any)=>void][]){const events=structuredClone(f.events);mutate(events);refuses(id,()=>inspectCoreRecordTypeJournal(f.base,f.current,events))}
 const changedKind=declareCoreElementKind(f.current,{module:'other',element:'R'},'group');refuses('later target kind invalidates earlier types',()=>inspectCoreRecordTypeJournal(f.base,changedKind.target,[...f.events,changedKind]),'CORE_TYPE_JOURNAL_LINK');
 const changedField=declareCoreElementKind(f.current,{module:'m',element:'v'},'group');refuses('later Field kind invalidates earlier types',()=>inspectCoreRecordTypeJournal(f.base,changedField.target,[...f.events,changedField]),'CORE_TYPE_JOURNAL_LINK');
 const older=structuredClone(f.base);older.umf='0.6.0';refuses('older envelope unavailable',()=>inspectCoreRecordTypeJournal(older,f.current,f.events),'CORE_TYPE_JOURNAL_SOURCE');
 const getter:any={};Object.defineProperty(getter,'base',{enumerable:true,get(){throw Error('getter invoked')}});refuses('getter input rejected',()=>inspectCoreRecordTypeJournal(getter,f.current,f.events),'NON_JSON');
 (result.events[0]!.source.modules[0]!.elements[0]!['future/field'] as any).values.reverse();check('copied receipts isolate caller',JSON.stringify(f.base.modules[0]!.elements[0]!['future/field'])==='{"values":["b","a"]}');
 result.types[0]!.link.reference.module='changed';check('copied result link isolates source',f.current.modules[0]!.elements[0]!.references![1]!.module==='other');
 check('fresh invocation retains types',inspectCoreRecordTypeJournal(f.base,f.current,f.events).types.length===2);
 return rows;
}

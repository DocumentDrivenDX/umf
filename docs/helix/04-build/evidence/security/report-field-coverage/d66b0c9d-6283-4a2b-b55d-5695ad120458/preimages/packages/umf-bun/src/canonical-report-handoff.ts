/** Closed report wire to native codec input; not acceptance/provenance admission. */
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeAcceptanceJson} from '../../postgresql/src/acceptance-json';
import {prepareCanonicalWireTree} from '../../postgresql/src/canonical-wire-tree';
const schemaPins={
 "exact-value-v0.1.schema.json": "0c804796bfbf68339c299f0c55d24db58fcfcc929bffe2d5ffaf4a2f27e24880",
 "history-record-v0.1.schema.json": "c35c1258028cc4c8c95dcd16b561caed4f2a347c086f72ebfc7bfc4f2dfcf2fe",
 "history-event-v0.1.schema.json": "e42f9b48642528cabbb646ccb758eb12b7f030029b712cf5d6f5174cbd90bfa6",
 "acceptance-input-v0.1.schema.json": "0278cbbbde843091c005b688fd9c081a2fdff843b9adda006ba80fb87828d7cd",
 "acceptance-rejection-v0.1.schema.json": "98262b8d99fe0f87f752140a418a4e4f8751c4d28986457302586fee622258cf",
 "enforcement-report-v0.1.schema.json": "7af9c786a297583d6eb5489d85f33fb0a04b2c1d0b6551e6d107528cc15c4137",
 "direct-cursor-v0.1.schema.json": "bff79ad2e5ccc1047b43bdbe6eeb51b597f098c881313fd980de01c1685b4942",
 "acceptance-report-v0.1.schema.json": "ccdc9976de3c158fae0a14d6cc41685d5f5a289d67daeb86b5e998b4a611e902"
} as const;

export async function createCanonicalAcceptanceReportHandoff(dependenciesPackage:string){
 return createPinnedReportHandoff(dependenciesPackage,schemaPins,'acceptance-report-v0.1.schema.json');
}

/** Explicit candidate composition. No released-profile or producer admission. */
export async function createProposedComposedAcceptanceReportHandoff(dependenciesPackage:string){
 return createPinnedReportHandoff(dependenciesPackage,{
  ...schemaPins,
  'history-retain-payload-v0.1.proposal.schema.json':'fc08e07a4b09636ac234737be9bb2cf3a9a3c26120baad612176574c17659605',
  'history-event-v0.2.proposal.schema.json':'714923be0f86bd3508a097cabfee63a180e03b19651ebbfa38844bb3e637b425',
  'acceptance-report-v0.3.proposal.schema.json':'c54196f8b4324aec768a33eeeab89bc2615a954af0e45559ed2038ccad7f14bf',
 },'acceptance-report-v0.3.proposal.schema.json');
}

async function createPinnedReportHandoff(dependenciesPackage:string,pins:Readonly<Record<string,string>>,reportName:string){
 const require=createRequire(dependenciesPackage),Ajv=require('ajv/dist/2020').default,ajv=new Ajv({strict:true});
 let reportSchema:unknown;
 for(const [name,expected] of Object.entries(pins)){
  const bytes=await readFile(new URL('../../../docs/helix/02-design/contracts/'+name,import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Original complete report schema pin mismatch');
  const schema=JSON.parse(bytes.toString('utf8'));if(name===reportName)reportSchema=schema;else ajv.addSchema(schema);
 }
 const validate=ajv.compile(reportSchema);
 return Object.freeze({schemaPins:Object.freeze({...pins}),prepare(original:Uint8Array){
  if(!(original.buffer instanceof ArrayBuffer)||original.length>1048576)throw Error('Original report wire byte custody/capacity required');
  const owned=Uint8Array.prototype.slice.call(original) as Uint8Array;
  if(!validate(decodeAcceptanceJson(owned)))throw Error('Closed complete report wire required');
  const handoff=prepareCanonicalWireTree(owned);
  return Object.freeze({...handoff,scope:'complete_report_wire_codec_handoff_only' as const});
 }});
}

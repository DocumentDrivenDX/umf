#!/usr/bin/env bun
/**
 * Archival runner for the two independently authored bun -e probes actually run.
 * The source bodies below are preserved verbatim. This wrapper, expected-output
 * assertions, and repo-path argument were added for the archival rerun.
 *
 * Finite behavioral matrix only: no universal, native SQL, or Docker proof.
 * Probe 1's hostile-input setup itself reads value.key before admission, producing
 * getterCalls 1; this is NOT a zero-invocation negative control. Probe 2 corrects
 * that setup and is the actual hostile getter control (getterCalls 0).
 */
const repo = process.argv[2] ?? '.';

const probes = [
  {
    name: 'original capability matrix',
    cases: 12,
    source: String.raw`
import fs from "node:fs";
import {verifyReferenceEntityOutputs} from "./scripts/actions-reference/handler-outputs";
import {admitActionInputs} from "./src/extensions/actions/selector";
import {actionFieldValueKey as k} from "./src/extensions/actions/evaluation";
const source=JSON.parse(fs.readFileSync("fixtures/actions/approve.json","utf8")),m=source.modules[0],action=m.extensions["umf.actions"].actions[0],record=m.elements.find(x=>x.id==="order");
action.authorization.profile={id:"umf.actions.roles",version:"1"};action.binding={kind:"handler",profile:{id:"umf.actions.container",version:"1"},handler:{id:"h",version:"1"}};
m.elements.push({id:"other",kind:"field",scalarType:"string",cardinality:"one",nullability:"required",extensions:{}});record.members.push({module:"sales",element:"other"});record.keys.push({id:"alt",name:"alternate",primary:false,fields:[{module:"sales",element:"status"},{module:"sales",element:"other"}]});
const entity={id:"1",record:{module:"sales",element:"order"},fields:Object.fromEntries(Object.entries({id:"o1",status:"pending",other:"secret"}).map(([element,value])=>[k({module:"sales",element}),{string:value}])),version:"v0"};
const input={key:{module:"sales",element:"order",key:"pk"},components:[{string:"o1"}]},alt={key:{module:"sales",element:"order",key:"alt"},components:[{string:"pending"},{string:"secret"}]};
const f=(id,access,identity,fields=[])=>({id,access,canonical:"entity:1",entity,identity,fields:fields.map(element=>k({module:"sales",element})),relationships:[],create:false,delete:false});
const check=(name,value,frames,parameters=new Map(),changes=[])=>{
 const a=structuredClone(action);a.outputs=[{id:"out",kind:"entity",target:value.key,required:true}];
 const p={source,action:a,inputs:{order:input},target:{module:"sales",action:"approve",revision:"r"},frames:[],expectedVersions:[]};
 try{const outputs=admitActionInputs(source,a,{out:value},true);verifyReferenceEntityOutputs(p,{frames,parameters,missingInputs:[],links:[]},{changes},outputs);console.log(name,"accepted");}catch(e){console.log(name,e.code);}
};
check("exact admitted input",input,[],new Map([["order",entity]]));
check("input alone cannot reveal alternate",alt,[],new Map([["order",entity]]));
check("exact READ alternate no field grants",alt,[f("r","read",alt)]);
check("READ primary no field grants",alt,[f("r","read",input)]);
check("READ fields union",alt,[f("r1","read",input,["status"]),f("r2","read",input,["other"])]);
check("WRITE cannot complete READ fields",alt,[f("r1","read",input,["status"]),f("w","write",input,["other"])]);
check("WRITE exact identity is not READ",alt,[f("w","write",alt,["status","other"])]);
check("deleted admitted input",input,[],new Map([["order",entity]]),[{kind:"deleted",entity}]);
check("deleted exact READ",alt,[f("r","read",alt)],new Map(),[{kind:"deleted",entity}]);
check("created arbitrary verified Key",alt,[],new Map(),[{kind:"created",entity:{...entity,id:"created:0"}}]);
check("unselected existing-like Key",alt,[]);
let getterCalls=0;const hostile={get key(){getterCalls++;return input.key},components:input.components};
check("hostile getter rejected by output admission",hostile,[]);console.log("getterCalls",getterCalls);
`,
    expected: [
      'exact admitted input accepted',
      'input alone cannot reveal alternate PARAMETER',
      'exact READ alternate no field grants accepted',
      'READ primary no field grants PARAMETER',
      'READ fields union accepted',
      'WRITE cannot complete READ fields PARAMETER',
      'WRITE exact identity is not READ PARAMETER',
      'deleted admitted input PARAMETER',
      'deleted exact READ PARAMETER',
      'created arbitrary verified Key accepted',
      'unselected existing-like Key PARAMETER',
      'hostile getter rejected by output admission NON_JSON',
      'getterCalls 1',
    ],
  },
  {
    name: 'other-canonical grant and corrected hostile getter controls',
    cases: 2,
    source: String.raw`
import fs from "node:fs";import {verifyReferenceEntityOutputs} from "./scripts/actions-reference/handler-outputs";import {admitActionInputs} from "./src/extensions/actions/selector";import {actionFieldValueKey as k} from "./src/extensions/actions/evaluation";
const source=JSON.parse(fs.readFileSync("fixtures/actions/approve.json","utf8")),m=source.modules[0],action=m.extensions["umf.actions"].actions[0],record=m.elements.find(e=>e.id==="order");action.authorization.profile={id:"umf.actions.roles",version:"1"};action.binding={kind:"handler",profile:{id:"umf.actions.container",version:"1"},handler:{id:"h",version:"1"}};m.elements.push({id:"other",kind:"field",scalarType:"string",cardinality:"one",nullability:"required",extensions:{}});record.members.push({module:"sales",element:"other"});record.keys.push({id:"alt",name:"alternate",primary:false,fields:[{module:"sales",element:"status"},{module:"sales",element:"other"}]});
const input={key:{module:"sales",element:"order",key:"pk"},components:[{string:"o1"}]},alt={key:{module:"sales",element:"order",key:"alt"},components:[{string:"pending"},{string:"secret"}]};action.outputs=[{id:"out",kind:"entity",target:alt.key,required:true}];
const entity=(id,primary,other)=>({id,record:{module:"sales",element:"order"},fields:{[k({module:"sales",element:"id"})]:{string:primary},[k({module:"sales",element:"status"})]:{string:"pending"},[k({module:"sales",element:"other"})]:{string:other}},version:"v0"}),a=entity("1","o1","secret"),b=entity("2","o2","different");
const frame=(entity,field)=>({id:"read"+entity.id,access:"read",canonical:"entity:"+entity.id,entity,identity:{key:input.key,components:[entity.fields[k({module:"sales",element:"id"})]]},fields:[k({module:"sales",element:field})],relationships:[],create:false,delete:false});
const prepared={source,action,inputs:{order:input},target:{module:"sales",action:"approve",revision:"r"},frames:[],expectedVersions:[]};
try{verifyReferenceEntityOutputs(prepared,{frames:[frame(a,"status"),frame(b,"other")],parameters:new Map(),missingInputs:[]},{changes:[]},admitActionInputs(source,action,{out:alt},true));console.log("other canonical accepted");}catch(e){console.log("other canonical cannot complete split grants",e.code);}
let calls=0;const hostile={get key(){calls++;return alt.key},components:alt.components};try{admitActionInputs(source,action,{out:hostile},true);}catch(e){console.log("hostile output",e.code,"getterCalls",calls);}
`,
    expected: [
      'other canonical cannot complete split grants PARAMETER',
      'hostile output NON_JSON getterCalls 0',
    ],
  },
];

let checked = 0;
for (const probe of probes) {
  const child = Bun.spawn([process.execPath, '-e', probe.source], {
    cwd: repo,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0 || stderr || stdout.trimEnd() !== probe.expected.join('\n')) {
    console.error(JSON.stringify({probe: probe.name, exitCode, stdout, stderr, expected: probe.expected}));
    process.exitCode = 1;
    break;
  }
  console.log(probe.name + ':');
  process.stdout.write(stdout);
  checked += probe.cases;
}
if (!process.exitCode) console.log(JSON.stringify({executedCases: checked, uniqueScenarios: 13, matchedExpectedOutputLines: 15, probes: 2, result: 'pass', scope: 'finite pure behavioral matrix; no native SQL or Docker proof'}));

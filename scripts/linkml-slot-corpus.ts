import {importLinkmlDocument,inspectLinkmlClassSlots,inspectLinkmlSlotValues,exportLinkmlDocument} from '../src';
import {parseNativeJson} from '../src/model/native-json';
const oracle=await Bun.file('fixtures/linkml/slot-corpus/oracle-results.json').json(),cases=[],counts:Record<string,number>={};
for(const c of oracle.cases){const format=c.path.endsWith('.json')?'json':'yaml',raw=await Bun.file(c.path).text(),d=importLinkmlDocument(raw,{id:c.path,format}),queries=[];
 for(const q of c.queries){let status:string,details:any={};if(q.status==='membership-blocked'){const r=inspectLinkmlClassSlots(d,q.className);status=r.status==='blocked'?'membership-blocked':'mismatch';details={diagnostics:r.diagnostics};}
  else{const r=inspectLinkmlSlotValues(d,q.className,q.slotName);if(exportLinkmlDocument(r.source)!==raw)throw Error('Source changed');if(q.status==='induction-blocked')status=r.status==='blocked'?'induction-blocked':'native-rejected';else if(r.status==='blocked')status='umf-blocked';else{const expected=Object.fromEntries(Object.entries(q.encodedFields).map(([k,v])=>[k,parseNativeJson(v as string)]));status=Object.keys({...r.fields,...expected}).every(k=>JSON.stringify((r.fields as any)[k])===JSON.stringify(expected[k]))?'compared':'mismatch';if(status==='mismatch')details={actual:r.fields,expected};}if(status==='umf-blocked'||status==='native-rejected')details={diagnostics:r.diagnostics};}
  counts[status]=(counts[status]??0)+1;queries.push({className:q.className,...(q.slotName?{slotName:q.slotName}:{}),status,...details});
 }
 cases.push({path:c.path,nativeStatus:c.status,queries});console.log(c.path,queries.length);
}
await Bun.write('fixtures/linkml/slot-corpus/results.json',JSON.stringify({counts,cases},null,2)+'\n');console.log(counts);if(counts.mismatch||counts['native-rejected']||counts['umf-blocked']||counts.compared!==310||counts['membership-blocked']!==24||counts['induction-blocked']!==13)throw Error('Native audit baseline changed; investigate every difference');

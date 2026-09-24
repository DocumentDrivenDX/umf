import {importLinkmlDocument,inspectLinkmlClassSlots,inspectLinkmlSlotValues,readDocument,writeDocument} from '../src';
const path='native/linkml/examples/slot-values.json',raw=await Bun.file(path).text(),d=importLinkmlDocument(raw,{id:path,format:'json'}),reports=[];
for(const className of Object.keys(JSON.parse(raw).classes))for(const slot of inspectLinkmlClassSlots(d,className).slots)for(const format of ['json','yaml'] as const){const {source,...report}=inspectLinkmlSlotValues(readDocument(writeDocument(d,format),format),className,slot.name);reports.push({format,report});}
await Bun.write('fixtures/linkml/slot-values/results.json',JSON.stringify({path,reports},null,2)+'\n');console.log({reports:reports.length});

import jsonld from 'jsonld';
import {equalCompactJsonLdText} from './jsonld-compare';
import {importJsonLdDocument,exportJsonLdDocument,proposeJsonLdFraming,readDocument,writeDocument} from '../src';
const manifest=await Bun.file('native/jsonld/framing-sources/manifest.json').json(),cases=[];
for(const c of manifest.cases){
 const id=c['@id'].slice(1),path='native/jsonld/framing-sources/'+c.input,raw=await Bun.file(path).text(),frame=await Bun.file('native/jsonld/framing-sources/'+c.frame).text(),baseIRI=c.option?.base??manifest.baseIRI+c.input,processingMode=c.option?.processingMode??c.option?.specVersion??'json-ld-1.1',contexts=new Map<string,{url:string;text:string}>();
 const documentLoader=async(url:string)=>{if(!url.startsWith(manifest.baseIRI))throw Error('No corpus resource '+url);const relative=url.slice(manifest.baseIRI.length);if(relative.includes('..')||relative.includes('?')||relative.includes('#'))throw Error('Unsupported corpus URL '+url);const text=await Bun.file('native/jsonld/framing-sources/'+relative).text();contexts.set(url,{url,text});return {contextUrl:null,documentUrl:url,document:JSON.parse(text)};};
 const options={frame,lossPolicy:'report' as const,...Object.fromEntries(Object.entries(c.option??{}).filter(([k])=>!['base','processingMode','specVersion'].includes(k)))};
 try{await jsonld().frame(JSON.parse(raw),JSON.parse(frame),{...options,base:baseIRI,processingMode,documentLoader});}catch{}
 const inputs={id,baseIRI,processingMode,contexts:[...contexts.values()]},d=importJsonLdDocument(raw,inputs),r=await proposeJsonLdFraming(d,options),exports=[];
 for(const format of ['json','yaml'] as const){if(exportJsonLdDocument(readDocument(writeDocument(d,format),format))!==raw)throw Error('Source differs');if(r.candidate){const out='fixtures/jsonld/framing/'+id+'.'+format+'.jsonld';await Bun.write(out,exportJsonLdDocument(readDocument(writeDocument(r.candidate,format),format)));exports.push({format,path:out});}}
 const expected=c.expect?await Bun.file('native/jsonld/framing-sources/'+c.expect).text():undefined;
 cases.push({id,path,inputs,options,positive:c['@type'].includes('jld:PositiveEvaluationTest'),expectedPath:c.expect?'native/jsonld/framing-sources/'+c.expect:undefined,expectedError:c.expectErrorCode,status:r.status,resourcesUsed:r.resourcesUsed,diagnostics:r.diagnostics,exports,...(r.candidate&&expected!==undefined?{matchesExpected:equalCompactJsonLdText(exportJsonLdDocument(r.candidate),expected)}:{})});
}
await Bun.write('fixtures/jsonld/framing/results.json',JSON.stringify({cases},null,2)+'\n');console.log({cases:cases.length,candidates:cases.filter(c=>c.status==='candidate').length,positiveBlocked:cases.filter(c=>c.positive&&c.status==='blocked').map(c=>c.id),negativeAccepted:cases.filter(c=>!c.positive&&c.status==='candidate').map(c=>c.id),mismatches:cases.filter(c=>c.matchesExpected===false).map(c=>c.id)});

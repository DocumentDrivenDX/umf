import {probe} from '../native/arrow/schema-probe';
import {createHash} from 'node:crypto';
const metadata=[{key:'ARROW:extension:name',value:'example.semantic'},{key:'ARROW:extension:metadata',value:'{"unit":"money"}'},{key:'unicode',value:'café'}];
const child={name:'item',nullable:true,type:{name:'int',bitWidth:32,isSigned:true},children:[],metadata:[]};
const types=[
 ...['null','bool','utf8','largeutf8','binary','largebinary','utf8view','binaryview'].map(name=>({name})),
 ...[8,16,32,64].flatMap(bitWidth=>[true,false].map(isSigned=>({name:'int',bitWidth,isSigned}))),
 ...['HALF','SINGLE','DOUBLE'].map(precision=>({name:'floatingpoint',precision})),
 ...[32,64,128,256].map(bitWidth=>({name:'decimal',bitWidth,precision:bitWidth===32?9:bitWidth===64?18:bitWidth===128?38:76,scale:4})),
 ...['DAY','MILLISECOND'].map(unit=>({name:'date',unit})),
 ...['SECOND','MILLISECOND','MICROSECOND','NANOSECOND'].flatMap(unit=>[{name:'time',unit,bitWidth:['SECOND','MILLISECOND'].includes(unit)?32:64},{name:'timestamp',unit,timezone:'America/New_York'},{name:'duration',unit}]),
 ...['YEAR_MONTH','DAY_TIME','MONTH_DAY_NANO'].map(unit=>({name:'interval',unit})),
 {name:'fixedsizebinary',byteWidth:16},{name:'list'},{name:'largelist'},{name:'fixedsizelist',listSize:3},{name:'struct'},
 {name:'union',mode:'DENSE',typeIds:[5]},{name:'union',mode:'SPARSE',typeIds:[5]},
 {name:'listview'},{name:'largelistview'},{name:'runendencoded'}
];
const cases=types.map((type,index)=>({id:'type-'+index,input:{fields:[{name:'value',nullable:true,type,children:['list','largelist','fixedsizelist','struct','union','listview','largelistview'].includes(type.name)?[child]:type.name==='runendencoded'?[{...child,name:'run_ends',nullable:false},{...child,name:'values'}]:[],metadata}],metadata:[{key:'schema-note',value:'preserve'}]}}));
cases.push({id:'duplicate-metadata',input:{fields:[{...child,metadata:[{key:'same',value:'first'},{key:'same',value:'second'}]}],metadata:[]}} as any);
cases.push({id:'dictionary-large-id',input:{fields:[{name:'dict',type:{name:'utf8'},nullable:true,children:[],metadata:[],dictionary:{id:9007199254740991,indexType:{name:'int',bitWidth:32,isSigned:true},isOrdered:true}}],metadata:[]}} as any);
const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const results=[];
for(const c of cases){
 try{const {before,after,bytes}=probe(c.input);const inputPreserved=canonical(c.input)===canonical(before);const ipcPreserved=canonical(before)===canonical(after);await Bun.write('fixtures/arrow/'+c.id+'.arrow',bytes);results.push({id:c.id,status:inputPreserved&&ipcPreserved?'preserved':'changed',inputPreserved,ipcPreserved,before,after,sha256:createHash('sha256').update(bytes).digest('hex')});}
 catch(error){results.push({id:c.id,status:'unsupported',message:(error as Error).message});}
}
await Bun.write('fixtures/arrow/schema-cases.json',JSON.stringify(cases,null,2)+'\n');
const report={package:'apache-arrow',version:'21.2.0',cases:cases.length,preserved:results.filter(r=>r.status==='preserved').length,changed:results.filter(r=>r.status==='changed').length,unsupported:results.filter(r=>r.status==='unsupported').length,results};
await Bun.write('fixtures/arrow/capability-results.json',JSON.stringify(report,null,2)+'\n');console.log({...report,results:results.filter(r=>r.status!=='preserved').map(r=>({id:r.id,status:r.status,message:(r as any).message,inputPreserved:(r as any).inputPreserved,ipcPreserved:(r as any).ipcPreserved}))});
if(report.cases!==52||report.preserved!==47||report.changed!==2||report.unsupported!==3)throw Error('Pinned Arrow capability baseline changed; inspect results');
const hashes=[];for(const path of ['package.json','src/ipc/metadata/json.ts','src/ipc/writer.ts','src/visitor/jsontypeassembler.ts'])hashes.push({path,sha256:createHash('sha256').update(await Bun.file('node_modules/apache-arrow/'+path).bytes()).digest('hex')});
await Bun.write('native/arrow/runtime-manifest.json',JSON.stringify({package:'apache-arrow',version:'21.2.0',artifacts:hashes,scope:'Pinned native JavaScript schema probe; not a public UMF Arrow extension'},null,2)+'\n');

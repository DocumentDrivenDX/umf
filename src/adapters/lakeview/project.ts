// SPDX-License-Identifier: MIT OR Apache-2.0
import {pointer,type Json} from '../../model/types';
import type {ProjectionIssue} from '../../projections/json-schema-protobuf';
export type LakeviewIssue=ProjectionIssue;
export interface LakeviewIds {data:string;datasets:string[];pages:{id:string;items:string[]}[];}
export interface LakeviewProjection {root:Json;modules:Map<string,Json>;elements:Map<string,Json>;issues:LakeviewIssue[];}
export const elementKey=(module:string,element:string)=>JSON.stringify([module,element]);
const SQL='databricks-sql';
const charts=new Set(['counter','bar','line','area','scatter','pie','heatmap','table']);
const controls:Record<string,string>={'filter-single-select':'single-select','filter-multi-select':'multi-select','filter-date-range-picker':'date-range','filter-text-entry':'text-search','filter-range-slider':'range'};
const channels:Record<string,string>={x:'x',y:'y',color:'color',size:'size',label:'label',value:'value',target:'target',angle:'angle',extra:'tooltip',columns:'column'};
const simple:Record<string,string>={SUM:'sum',AVG:'avg',MIN:'min',MAX:'max',COUNT:'count'};
const formats:Record<string,string>={'number':'number','number-plain':'number','number-currency':'currency','number-percent':'percent'};
// Renderer options that change presentation only; each widget reports them once.
const presentation=['withRowNumber','paginationSize','itemsPerPage','condensed','allowHTMLByDefault','bandedRows','invisibleColumns'];
const roles:Record<string,string>={canvasBackgroundColor:'canvasBackground',widgetBackgroundColor:'widgetBackground',widgetBorderColor:'widgetBorder',fontColor:'font',selectionColor:'selection'};
// Aggregate function names Lakeview and Databricks SQL emit around a single column; anything else is a row-level function.
const aggregate=/^(SUM|AVG|MEAN|MIN|MAX|COUNT|COUNT_IF|SUM_IF|AVG_IF|ANY_VALUE|FIRST|LAST|MEDIAN|MODE|PERCENTILE|PERCENTILE_APPROX|APPROX_PERCENTILE|APPROX_COUNT_DISTINCT|STDDEV|STDDEV_POP|STDDEV_SAMP|VARIANCE|VAR_POP|VAR_SAMP|MIN_BY|MAX_BY|BOOL_AND|BOOL_OR|EVERY|SOME|COLLECT_LIST|COLLECT_SET|ARRAY_AGG)\s*\(/i;
const quoted='`((?:[^`]|``)+)`';
const unquote=(name:string)=>name.replaceAll('``','`');
const hex=(value:unknown)=>typeof value==='string'&&/^#[0-9A-Fa-f]{6}$/.test(value);
type Use={field:string;aggregation:string;expression?:{language:string;text:string};derived?:boolean};
class Skip extends Error {constructor(readonly path:string,readonly code:string,readonly detail:string){super(detail);}}
/** Projects a parsed .lvdash.json into umf.dashboard payloads, consuming or reporting every native member. */
export function projectLakeview(view:any,ids:LakeviewIds,options:{title:string}):LakeviewProjection{
 const issues:LakeviewIssue[]=[],used=new Set<string>(),modules=new Map<string,Json>(),elements=new Map<string,Json>();
 const use=(...paths:string[])=>{for(const p of paths)used.add(p);};
 const issue=(path:string,code:string,classification:LakeviewIssue['classification'],detail:string,consume=true)=>{issues.push({path,code,classification,detail,retainedInSource:true});if(consume)used.add(path);};
 const at=(path:string,key:string|number)=>path+'/'+pointer(String(key));
 const datasets=new Map<string,{id:string;path:string;fields:Record<string,any>}>();
 const declared:{id:string;payload:any}[]=[];
 (Array.isArray(view.datasets)?view.datasets:[]).forEach((ds:any,i:number)=>{
  const path=at('/datasets',i),fields:Record<string,any>={};let source:any;
  if(typeof ds?.name!=='string')return;use(at(path,'name'));
  if(Array.isArray(ds.queryLines)&&ds.queryLines.every((l:unknown)=>typeof l==='string')){source={kind:'query',query:{language:SQL,text:ds.queryLines.join('')}};use(at(path,'queryLines'));}
  else if(typeof ds.query==='string'){source={kind:'query',query:{language:SQL,text:ds.query}};use(at(path,'query'));}
  if(typeof ds.displayName==='string')use(at(path,'displayName'));
  for(const key of ['catalog','schema'])if(ds[key]!==undefined)issue(at(path,key),'LAKEVIEW_DATASET_CONTEXT','unsupported','Default '+key+' '+JSON.stringify(ds[key])+' resolves unqualified names in the query; the neutral query text does not carry it');
  if(Array.isArray(ds.parameters))ds.parameters.forEach((p:any,j:number)=>issue(at(at(path,'parameters'),j),'LAKEVIEW_PARAMETER','unsupported','Dataset parameter '+JSON.stringify(p?.keyword??p?.displayName)+' has no neutral form'));
  if(Array.isArray(ds.columns))ds.columns.forEach((c:any,j:number)=>{
   const p=at(at(path,'columns'),j);if(typeof c?.displayName!=='string'||typeof c.expression!=='string')return;
   fields[c.displayName]={role:'measure',...(typeof c.description==='string'?{description:c.description}:{}),expression:{language:SQL,text:c.expression}};
   use(at(p,'displayName'),at(p,'expression'));if(typeof c.description==='string')use(at(p,'description'));
  });
  if(!source){issue(path,'LAKEVIEW_PROJECTION','unsupported','Dataset declares no query; it is not projected',false);return;}
  datasets.set(ds.name,{id:ids.datasets[i]!,path,fields});
  declared.push({id:ids.datasets[i]!,payload:{kind:'dataset',title:typeof ds.displayName==='string'?ds.displayName:ds.name,source,fields}});
 });
 function resolve(expression:string,fields:Record<string,any>,path:string):Use{
  let m:RegExpExecArray|null;
  if(new RegExp(quoted+'\\s*\\.\\s*`').test(expression))throw new Skip(path,'LAKEVIEW_RELATIONSHIP','Qualified reference '+expression+' reads a relationship-graph source; it has no neutral form');
  if((m=new RegExp('^'+quoted+'$').exec(expression)))return {field:unquote(m[1]!),aggregation:'none'};
  if((m=new RegExp('^MEASURE\\('+quoted+'\\)$','i').exec(expression))){const name=unquote(m[1]!);if(fields[name]?.role!=='measure')throw new Skip(path,'LAKEVIEW_EXPRESSION','MEASURE of undeclared dataset measure '+JSON.stringify(name));return {field:name,aggregation:'measure'};}
  if((m=new RegExp('^(SUM|AVG|MIN|MAX|COUNT)\\('+quoted+'\\)$','i').exec(expression))&&m[2]!=='*')return {field:unquote(m[2]!),aggregation:simple[m[1]!.toUpperCase()]!};
  if((m=new RegExp('^COUNT\\(DISTINCT '+quoted+'\\)$','i').exec(expression)))return {field:unquote(m[1]!),aggregation:'count-distinct'};
  const names=new Set([...expression.matchAll(new RegExp(quoted,'g'))].map(r=>unquote(r[1]!)));
  if(names.size!==1||names.has('*'))throw new Skip(path,'LAKEVIEW_EXPRESSION','Expression '+expression+' does not reference exactly one column');
  const field=[...names][0]!;
  if(aggregate.test(expression))return {field,aggregation:'custom',expression:{language:SQL,text:expression}};
  return {field,aggregation:'none',derived:true};
 }
 // Report what a query does beyond declaring fields; these apply to every widget query.
 function queryLosses(base:string,q:any){
  if(Array.isArray(q.filters))q.filters.forEach((f:any,i:number)=>issue(at(at(base,'filters'),i),'LAKEVIEW_QUERY_FILTER','unsupported','Widget-level filter '+(f?.expression??JSON.stringify(f))+' narrows only this native widget; the neutral item is broader'));
  if(Array.isArray(q.orders))q.orders.forEach((o:any,i:number)=>issue(at(at(base,'orders'),i),'LAKEVIEW_ORDER_BY','unsupported','Query order '+(o?.expression??'')+' '+(o?.direction??'')+' is not declared on the neutral item'));
  if(Array.isArray(q.parameters))q.parameters.forEach((p:any,i:number)=>issue(at(at(base,'parameters'),i),'LAKEVIEW_PARAMETER','unsupported','Query binds parameter '+JSON.stringify(p?.keyword??p?.name)+'; parameters have no neutral form'));
 }
 function scaleOf(scale:any,path:string,channel:string){
  const out:any={};if(!scale||typeof scale!=='object')return out;
  if(['quantitative','temporal','categorical'].includes(scale.type)){out.scale=scale.type;use(at(path,'type'));}
  const sort=scale.sort,sp=at(path,'sort'),m=typeof sort?.by==='string'?/^(x|y|natural-order|alphabetical)(-reversed)?$/.exec(sort.by):null;
  if(m&&m[1]!==channel){out.sort={by:(['natural-order','alphabetical'].includes(m[1]!)?'label':'value')+(m[2]?'-descending':'-ascending')};use(at(sp,'by'));}
  if(sort?.by==='custom-order'&&Array.isArray(sort.orderedValues)&&sort.orderedValues.length&&sort.orderedValues.every((v:unknown)=>typeof v==='string')){out.sort={by:'custom',values:[...sort.orderedValues]};use(at(sp,'by'),at(sp,'orderedValues'));}
  for(const key of ['colorRamp','mappings'])if(scale[key]!==undefined)issue(at(path,key),'LAKEVIEW_STYLE','annotation-only','Scale '+key+' is not declared');
  return out;
 }
 function formatOf(format:any,path:string){
  const kind=formats[format?.type];if(!kind)return undefined;const out:any={kind};use(at(path,'type'));
  if(typeof format.currencyCode==='string'){out.currency=format.currencyCode;use(at(path,'currencyCode'));}
  if(['compact','none'].includes(format.abbreviation)){out.abbreviation=format.abbreviation;use(at(path,'abbreviation'));}
  if(format.hideGroupSeparator!==undefined)issue(at(path,'hideGroupSeparator'),'LAKEVIEW_STYLE','annotation-only','Group separator setting is not declared');
  const places=format.decimalPlaces,p=at(path,'decimalPlaces');
  if(Number.isInteger(places?.places)&&places.places>=0){
   out.decimals=places.places;use(at(p,'places'));
   if(places.type==='exact')use(at(p,'type'));else issue(at(p,'type'),'LAKEVIEW_FORMAT','representation-change','Native '+JSON.stringify(places.type)+' decimal places; the neutral format declares a fixed count of '+places.places);
  }
  return out;
 }
 function widget(item:any,path:string,scale:number):any{
  const w=item?.widget??{},wp=at(path,'widget'),pos=item?.position;let position:any;
  if(['x','y','width','height'].every(k=>Number.isInteger(pos?.[k]))){position={x:pos.x*scale,y:pos.y,width:pos.width*scale,height:pos.height};for(const k of ['x','y','width','height'])use(at(at(path,'position'),k));}
  if(typeof w.name==='string')use(at(wp,'name'));
  if(Array.isArray(w.multilineTextboxSpec?.lines)&&position){use(at(at(wp,'multilineTextboxSpec'),'lines'));return {kind:'text',content:{format:'markdown',text:w.multilineTextboxSpec.lines.join('')},position};}
  if(typeof w.textbox_spec==='string'&&position){use(at(wp,'textbox_spec'));return {kind:'text',content:{format:'markdown',text:w.textbox_spec},position};}
  const spec=w.spec,sp=at(wp,'spec');if(!spec||typeof spec!=='object'||!position)return undefined;
  const type=spec.widgetType,chart=charts.has(type),control=controls[type];
  if(!chart&&!control){issue(wp,'LAKEVIEW_WIDGET_TYPE','unsupported','Widget type '+JSON.stringify(type)+' version '+spec.version+' has no neutral chart family; only the native payload is retained');return undefined;}
  const pending:{fields:Record<string,any>;name:string}[]=[];
  const column=(fields:Record<string,any>,name:string,path:string)=>{if(fields[name]&&fields[name].role!=='column')throw new Skip(path,'LAKEVIEW_FIELD_COLLISION','Column '+JSON.stringify(name)+' shares its name with a dataset measure');pending.push({fields,name});};
  const queries:any[]=Array.isArray(w.queries)?w.queries:[];
  const query=(index:number)=>{
   const q=queries[index],qp=at(at(wp,'queries'),index),base=at(qp,'query'),ds=datasets.get(q?.query?.datasetName);
   if(q?.query&&q.query.datasetName===undefined)throw new Skip(qp,'LAKEVIEW_RELATIONSHIP','Query names no dataset; it reads relationship-graph sources, which have no neutral form');
   if(!ds)throw new Skip(qp,'LAKEVIEW_PROJECTION','Query reads dataset '+JSON.stringify(q?.query?.datasetName)+', which is not projected');
   if(typeof q.name==='string')use(at(qp,'name'));use(at(base,'datasetName'));if(typeof q.query.disaggregated==='boolean')use(at(base,'disaggregated'));
   return {q:q.query,base,ds,field(name:string){const i=(q.query.fields??[]).findIndex((f:any)=>f?.name===name);if(i<0||typeof q.query.fields[i].expression!=='string')throw new Skip(base,'LAKEVIEW_PROJECTION','Encoding field '+JSON.stringify(name)+' is not a query field');const fp=at(at(base,'fields'),i);const r=resolve(q.query.fields[i].expression,ds.fields,fp);if(r.derived)issue(fp,'LAKEVIEW_EXPRESSION','representation-change','Row-level expression '+q.query.fields[i].expression+' is declared as its column '+JSON.stringify(r.field)+' without the transformation',false);if(r.aggregation!=='measure')column(ds.fields,r.field,fp);use(at(fp,'name'),at(fp,'expression'));return r;}};
  };
  try{
   for(const [index,q] of queries.entries())if(q?.query)queryLosses(at(at(at(wp,'queries'),index),'query'),q.query);
   const frame=spec.frame??{},fp=at(sp,'frame');use(at(sp,'widgetType'),at(sp,'version'));
   for(const key of ['showTitle','showDescription'])if(frame[key]===true)use(at(fp,key));else if(frame[key]===false)issue(at(fp,key),'LAKEVIEW_STYLE','annotation-only',key==='showTitle'?'Title is hidden natively':'Description is hidden natively');
   if(typeof frame.title==='string')use(at(fp,'title'));if(typeof frame.description==='string')use(at(fp,'description'));
   if(frame.headerAlignment!==undefined)issue(at(fp,'headerAlignment'),'LAKEVIEW_STYLE','annotation-only','Header alignment '+JSON.stringify(frame.headerAlignment)+' is not declared');
   const rendered=presentation.filter(k=>spec[k]!==undefined);if(rendered.length){for(const k of rendered)use(at(sp,k));issue(sp,'LAKEVIEW_STYLE','annotation-only','Renderer options '+rendered.join(', ')+' are not declared',false);}
   if(typeof spec.data?.queryName==='string'&&queries.some(q=>q?.name===spec.data.queryName))use(at(at(sp,'data'),'queryName'));
   const description=typeof frame.description==='string'?{description:frame.description}:{};
   const enc=spec.encodings??{},ep=at(sp,'encodings');let out:any;
   if(chart){
    if(queries.length!==1)throw new Skip(wp,'LAKEVIEW_PROJECTION','A visual widget with '+queries.length+' queries has no single neutral dataset');
    const main=query(0),encodings:any[]=[];
    for(const [key,value] of Object.entries<any>(enc)){
     const channel=channels[key],kp=at(ep,key);if(!channel)continue;
     const entries:[any,string,any][]=Array.isArray(value)?value.map((e,i)=>[e,at(kp,i),e]):Array.isArray(value?.fields)?value.fields.map((e:any,i:number)=>[e,at(at(kp,'fields'),i),value]):[[value,kp,value]];
     for(const [e,p,shared] of entries){
      if(typeof e?.fieldName!=='string'){issue(p,'LAKEVIEW_STYLE','annotation-only','Encoding '+key+' without a field ('+JSON.stringify(e)+') is presentation only');continue;}
      if(channel==='column'&&e.visible===false){issue(p,'LAKEVIEW_STYLE','annotation-only','Hidden table column '+JSON.stringify(e.fieldName)+' is not declared');continue;}
      if(channel==='column'&&e.visible===true)use(at(p,'visible'));
      if(e.style!==undefined)issue(at(p,'style'),'LAKEVIEW_STYLE','annotation-only','Conditional or text styling of '+JSON.stringify(e.fieldName)+' is not declared');
      const r=main.field(e.fieldName);use(at(p,'fieldName'));
      const encoding:any={channel,field:r.field,aggregation:r.aggregation,...(r.expression?{expression:r.expression}:{})};
      if(typeof e.displayName==='string'){encoding.title=e.displayName;use(at(p,'displayName'));}
      Object.assign(encoding,scaleOf(shared.scale,at(shared===e?p:kp,'scale'),key));
      const format=formatOf(shared.format,at(shared===e?p:kp,'format'));if(format)encoding.format=format;
      // Table columns carry many renderer options; report them once per column rather than one by one.
      if(channel==='column'){const rest=Object.keys(e).filter(k=>!['fieldName','displayName','format','scale','visible'].includes(k));if(rest.length){for(const k of rest)use(at(p,k));issue(p,'LAKEVIEW_STYLE','annotation-only','Table column presentation options '+rest.join(', ')+' are not declared',false);}}
      encodings.push(encoding);
     }
    }
    out={kind:'visual',title:typeof frame.title==='string'?frame.title:w.name,...description,chart:type,dataset:{module:ids.data,element:main.ds.id},...(main.q.disaggregated===true?{rows:'detail'}:{}),encodings,position};
   } else {
    const targets:any[]=[],seen=new Set<string>();let title:string|undefined;
    for(const [i,e] of (Array.isArray(enc.fields)?enc.fields:[]).entries()){
     const p=at(at(ep,'fields'),i);
     if(e?.parameterName!==undefined){issue(p,'LAKEVIEW_PARAMETER','unsupported','Filter binds query parameter '+JSON.stringify(e.parameterName)+'; parameter filters have no neutral form');continue;}
     const qi=queries.findIndex(q=>q?.name===e?.queryName);if(qi<0||typeof e?.fieldName!=='string')continue;
     const target=query(qi),r=target.field(e.fieldName);
     if(r.aggregation!=='none'||r.derived)throw new Skip(p,'LAKEVIEW_EXPRESSION','Filter field '+JSON.stringify(e.fieldName)+' is not a plain column');
     use(at(p,'fieldName'),at(p,'queryName'));if(typeof e.displayName==='string'){use(at(p,'displayName'));title??=e.displayName;}
     const key=JSON.stringify([target.ds.id,r.field]);if(!seen.has(key)){seen.add(key);targets.push({dataset:{module:ids.data,element:target.ds.id},field:r.field});}
    }
    for(const [index,q] of queries.entries())for(const [i,f] of (Array.isArray(q?.query?.fields)?q.query.fields:[]).entries())
     if(typeof f?.expression==='string'&&/^COUNT_IF\(`associative_filter_predicate_group`\)$/i.test(f.expression))issue(at(at(at(at(at(wp,'queries'),index),'query'),'fields'),i),'LAKEVIEW_FILTER_ASSOCIATIVITY','annotation-only','Associative value narrowing between filters is platform interactivity with no neutral form');
    if(!targets.length)throw new Skip(wp,'LAKEVIEW_PROJECTION','Filter has no dataset column target');
    out={kind:'filter',title:typeof frame.title==='string'?frame.title:title??w.name,...description,control,targets,position};
    const selection=spec.selection?.defaultSelection,dp=at(at(sp,'selection'),'defaultSelection');
    if(Array.isArray(selection?.values?.values)&&selection.values.values.every((v:any)=>['string','number','boolean'].includes(typeof v?.value))){
     out.default={values:selection.values.values.map((v:any)=>v.value)};selection.values.values.forEach((_:any,i:number)=>use(at(at(at(at(dp,'values'),'values'),i),'value')));
     if(typeof selection.values.dataType==='string')use(at(at(dp,'values'),'dataType'));
    } else if(selection?.range)issue(at(dp,'range'),'LAKEVIEW_FILTER_DEFAULT','unsupported','Range default '+JSON.stringify(selection.range)+' has no neutral form');
   }
   for(const {fields,name} of pending)fields[name]??={role:'column'};
   return out;
  }catch(error){
   if(!(error instanceof Skip))throw error;
   issue(error.path,error.code,'unsupported',error.detail+'; the widget is not projected');
   use(wp,at(path,'position'));return undefined;
  }
 }
 const pages:any[]=Array.isArray(view.pages)?view.pages:[];
 const twelve=pages.some(p=>p?.layoutVersion!==undefined),columns=twelve?12:6;
 pages.forEach((page,i)=>{
  const path=at('/pages',i),id=ids.pages[i]!.id;let scale=1;
  if(typeof page.name==='string')use(at(path,'name'));if(typeof page.displayName==='string')use(at(path,'displayName'));
  if(['PAGE_TYPE_CANVAS','PAGE_TYPE_GLOBAL_FILTERS'].includes(page.pageType))use(at(path,'pageType'));
  if(page.layoutVersion==='GRID_V1')use(at(path,'layoutVersion'));
  else if(page.layoutVersion===undefined&&twelve){scale=2;issue(path,'LAKEVIEW_GRID','representation-change','Six-column legacy page doubled horizontally into the twelve-column document grid; vertical units are kept',false);}
  modules.set(id,{kind:'page',title:typeof page.displayName==='string'?page.displayName:id,role:page.pageType==='PAGE_TYPE_GLOBAL_FILTERS'?'global-filters':'canvas'});
  (Array.isArray(page.layout)?page.layout:[]).forEach((item:any,j:number)=>{const payload=widget(item,at(at(path,'layout'),j),scale);if(payload)elements.set(elementKey(id,ids.pages[i]!.items[j]!),payload);});
 });
 modules.set(ids.data,{kind:'data'});
 for(const {id,payload} of declared){
  if(Object.keys(payload.fields).length){elements.set(elementKey(ids.data,id),payload);continue;}
  issue(at('/datasets',ids.datasets.indexOf(id)),'LAKEVIEW_PROJECTION','unsupported','No projected item uses a field of this dataset, and the profile requires at least one; it is not projected',false);
 }
 const theme:any={},tp='/uiSettings/theme',t=view.uiSettings?.theme;
 if(t&&typeof t==='object'){
  if(typeof t.fontFamily==='string'){theme.fontFamily=t.fontFamily;use(at(tp,'fontFamily'));}
  // fontSettings.base is the newer spelling of the dashboard font; an explicit top-level font wins.
  const base=t.fontSettings?.base,bp=at(at(tp,'fontSettings'),'base');
  if(typeof base?.fontFamily==='string'&&theme.fontFamily===undefined){theme.fontFamily=base.fontFamily;use(at(bp,'fontFamily'));}
  if(base?.fontColor&&t.fontColor===undefined){const out:any={};for(const mode of ['light','dark'])if(hex(base.fontColor[mode])){out[mode]=base.fontColor[mode];use(at(at(bp,'fontColor'),mode));}if(Object.keys(out).length)(theme.roles??={}).font=out;}
  if(Array.isArray(t.visualizationColors)&&t.visualizationColors.length&&t.visualizationColors.every(hex)){theme.palette=[...t.visualizationColors];use(at(tp,'visualizationColors'));}
  for(const [native,role] of Object.entries(roles)){const c=t[native],out:any={};for(const mode of ['light','dark'])if(hex(c?.[mode])){out[mode]=c[mode];use(at(at(tp,native),mode));}if(Object.keys(out).length)(theme.roles??={})[role]=out;}
  for(const key of ['widgetHeaderAlignment','widgetCornerRadius'])if(t[key]!==undefined)issue(at(tp,key),'LAKEVIEW_STYLE','annotation-only','Theme setting '+key+'='+JSON.stringify(t[key])+' is not declared');
 }
 if(view.relationshipGraphs!==undefined)issue('/relationshipGraphs','LAKEVIEW_RELATIONSHIP','unsupported','Dataset relationship graphs have no neutral form');
 const root={kind:'dashboard',title:options.title,pages:ids.pages.map(p=>p.id),layout:{columns},...(Object.keys(theme).length?{theme}:{})};
 const touched=new Set<string>();for(const p of used){let q=p;while(q){q=q.slice(0,q.lastIndexOf('/'));touched.add(q);}}
 (function walk(value:any,path:string){
  if(used.has(path))return;
  const container=value!==null&&typeof value==='object';
  if(!touched.has(path)){if(!container||Object.keys(value).length)issue(path,'LAKEVIEW_UNMAPPED','unsupported','Native content '+JSON.stringify(value).slice(0,120)+' is retained but not expressed by the neutral declaration');return;}
  if(container)for(const [key,child] of Object.entries(value))walk(child,at(path,key));
 })(view,'');
 return {root:root as unknown as Json,modules,elements,issues};
}

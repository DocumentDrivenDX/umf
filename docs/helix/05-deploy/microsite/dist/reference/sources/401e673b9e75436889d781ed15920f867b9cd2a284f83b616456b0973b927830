import manifest from '../../../spec/extensions/dashboard/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {readDocument,writeDocument,editExtension} from '../../model/document';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const DASHBOARD_EXTENSION='umf.dashboard';
export const dashboardPackage=manifest as unknown as ExtensionPackage;
export interface DashboardReference {module:string;element:string;}
export interface DashboardExpression {language:string;version?:string;text:string;}
export interface DashboardPosition {x:number;y:number;width:number;height:number;}
export interface DashboardModeColor {light?:string;dark?:string;}
export interface DashboardTheme {name?:string;fontFamily?:string;palette?:string[];roles?:Partial<Record<'canvasBackground'|'widgetBackground'|'widgetBorder'|'font'|'selection',DashboardModeColor>>;}
export interface DashboardField {role:'column'|'measure';type?:'string'|'boolean'|'integer'|'decimal'|'date'|'date-time';title?:string;description?:string;expression?:DashboardExpression;}
export type DashboardChannel='x'|'y'|'value'|'target'|'color'|'size'|'angle'|'label'|'detail'|'tooltip'|'column';
export type DashboardChart='counter'|'bar'|'line'|'area'|'scatter'|'pie'|'heatmap'|'table';
export interface DashboardEncoding {channel:DashboardChannel;field:string;aggregation:'none'|'measure'|'sum'|'avg'|'count'|'count-distinct'|'min'|'max'|'custom';expression?:DashboardExpression;title?:string;scale?:'quantitative'|'temporal'|'categorical';sort?:{by:'value-ascending'|'value-descending'|'label-ascending'|'label-descending'|'custom';values?:string[]};format?:{kind:'number'|'currency'|'percent'|'date';decimals?:number;abbreviation?:'none'|'compact';currency?:string};}
interface DashboardBase {description?:string;[key:string]:unknown;}
export interface DashboardRoot extends DashboardBase {kind:'dashboard';title:string;pages:string[];layout:{columns:number};theme?:DashboardTheme;}
export interface DashboardPage extends DashboardBase {kind:'page';title:string;role:'canvas'|'global-filters';}
export interface DashboardData extends DashboardBase {kind:'data';}
export interface DashboardDataset extends DashboardBase {kind:'dataset';title:string;grain?:string;source:{kind:'table';table:string}|{kind:'query';query:DashboardExpression};fields:Record<string,DashboardField>;}
export interface DashboardVisual extends DashboardBase {kind:'visual';title:string;trace?:string;chart:DashboardChart;dataset:DashboardReference;rows?:'aggregated'|'detail';encodings:DashboardEncoding[];position:DashboardPosition;}
export interface DashboardText {kind:'text';trace?:string;content:{format:'plain'|'markdown';text:string};position:DashboardPosition;[key:string]:unknown;}
export interface DashboardFilter {kind:'filter';title:string;trace?:string;control:'single-select'|'multi-select'|'date-range'|'range'|'text-search';targets:{dataset:DashboardReference;field:string}[];default?:{values:(string|number|boolean)[]};position:DashboardPosition;[key:string]:unknown;}
export type DashboardDefinition=DashboardDataset|DashboardVisual|DashboardText|DashboardFilter;
const kinds:Record<string,string>={'dashboard':'dashboard','page':'page','data':'data','dataset':'dataset','visual':'visual','text':'text','filter':'filter'};
const scopes:Record<string,string>={'dashboard':'document','page':'module','data':'module','dataset':'element','visual':'element','text':'element','filter':'element'};
// Channel rules are deliberately small: each chart names the channels it must have and the channels it may use.
const charts:Record<DashboardChart,{required:DashboardChannel[];allowed:DashboardChannel[]}>={
 counter:{required:['value'],allowed:['value','target','tooltip']},
 bar:{required:['x','y'],allowed:['x','y','color','label','detail','tooltip']},
 line:{required:['x','y'],allowed:['x','y','color','label','detail','tooltip']},
 area:{required:['x','y'],allowed:['x','y','color','label','detail','tooltip']},
 scatter:{required:['x','y'],allowed:['x','y','color','size','label','detail','tooltip']},
 pie:{required:['angle','color'],allowed:['angle','color','label','tooltip']},
 heatmap:{required:['x','y','color'],allowed:['x','y','color','label','tooltip']},
 table:{required:['column'],allowed:['column']}
};
const singular:DashboardChannel[]=['x','value','target','angle','color','size'];
const positioned=new Set(['visual','text','filter']);
function semantics(value:Json,context:{document:Document;path:string;scope:string}):Diagnostic[]{
 const p=value as any;const doc=context.document;const out:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>out.push({code,path:context.path+path,message,severity});
 const localIndex=/\/modules\/(\d+)/.exec(context.path);const local=localIndex?doc.modules[Number(localIndex[1])]:undefined;
 const root=doc.extensions?.[DASHBOARD_EXTENSION] as any;
 const refKey=(r:DashboardReference)=>JSON.stringify([r.module,r.element]);
 function resolve(ref:DashboardReference,path:string):DashboardDataset|undefined {
  const target=doc.modules.find(m=>m.id===ref.module)?.elements.find(e=>e.id===ref.element)?.extensions[DASHBOARD_EXTENSION] as any;
  if(!target){add('DASHBOARD_REFERENCE',path,'Missing dashboard dataset '+refKey(ref));return;}
  if(target.kind!=='dataset'){add('DASHBOARD_REFERENCE',path,'Reference must denote a dataset');return;}
  return target;
 }
 // Preserve unknown properties, but never treat them as interpreted vocabulary.
 function unknown(node:any,schema:any,path:string):void {
  if(schema.$ref)schema=(manifest.schema.$defs as any)[schema.$ref.split('/').at(-1)];
  if(schema.oneOf){schema=schema.oneOf.find((candidate:any)=>candidate.properties?.kind?.const===node?.kind);if(!schema)return;}
  if(schema.type==='object'&&node&&typeof node==='object'&&!Array.isArray(node))for(const[key,child]of Object.entries(node)){
   const next=(schema.properties&&Object.hasOwn(schema.properties,key)?schema.properties[key]:undefined)??(typeof schema.additionalProperties==='object'?schema.additionalProperties:undefined);
   if(next)unknown(child,next,path+'/'+pointer(key));else add('DASHBOARD_UNKNOWN',path+'/'+pointer(key),'Unknown dashboard content retained','warning');
  }
  if(schema.type==='array'&&Array.isArray(node)&&typeof schema.items==='object')node.forEach((child,index)=>unknown(child,schema.items,path+'/'+index));
 }
 const opaque=(path:string)=>add('DASHBOARD_EXPRESSION_OPAQUE',path,'Expression is preserved with its language/version; it is not parsed, executed or translated','warning');
 unknown(p,(manifest.schema.$defs as any)[kinds[p.kind]!],'');
 if(context.scope!==scopes[p.kind]){add('DASHBOARD_SCOPE','','Dashboard declaration has the wrong attachment scope');return out;}
 if(context.scope==='element'){
  const container=(local?.extensions?.[DASHBOARD_EXTENSION] as any)?.kind;
  if(root?.kind!=='dashboard')add('DASHBOARD_ROOT','','Dashboard elements require a document-level dashboard declaration');
  if(p.kind==='dataset'&&container!=='data')add('DASHBOARD_PLACEMENT','','Datasets belong in a data module');
  if(positioned.has(p.kind)&&container!=='page')add('DASHBOARD_PLACEMENT','','Visuals, text and filters belong in a page module');
  if(container==='page'&&(local!.extensions![DASHBOARD_EXTENSION] as any).role==='global-filters'&&p.kind!=='filter')add('DASHBOARD_GLOBAL_FILTERS','','A global-filters page holds only filters');
  if(positioned.has(p.kind)&&typeof root?.layout?.columns==='number'&&p.position.x+p.position.width>root.layout.columns)add('DASHBOARD_LAYOUT','/position','Position exceeds the declared grid columns');
 }
 if(p.kind==='dashboard'){
  const pageModules=doc.modules.filter(m=>(m.extensions?.[DASHBOARD_EXTENSION] as any)?.kind==='page').map(m=>m.id);
  const listed=new Set<string>();
  for(const[index,id]of(p.pages as string[]).entries()){
   if(listed.has(id))add('DASHBOARD_PAGES','/pages/'+index,'Page is listed more than once');listed.add(id);
   if(!pageModules.includes(id))add('DASHBOARD_PAGES','/pages/'+index,'Listed page is not a page module');
  }
  for(const id of pageModules)if(!listed.has(id))add('DASHBOARD_PAGES','/pages','Page module '+JSON.stringify(id)+' is not listed in page order');
  const traces=new Map<string,string>();
  for(const module of doc.modules)for(const element of module.elements){
   const trace=(element.extensions[DASHBOARD_EXTENSION] as any)?.trace;if(typeof trace!=='string')continue;
   const owner=JSON.stringify([module.id,element.id]);
   if(traces.has(trace))add('DASHBOARD_TRACE','','Trace id '+JSON.stringify(trace)+' is shared by '+traces.get(trace)+' and '+owner);else traces.set(trace,owner);
  }
  for(const module of doc.modules){
   if((module.extensions?.[DASHBOARD_EXTENSION] as any)?.kind!=='page')continue;
   const boxes=module.elements.map(e=>({id:e.id,payload:e.extensions[DASHBOARD_EXTENSION] as any})).filter(b=>positioned.has(b.payload?.kind)&&b.payload.position);
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i]!.payload.position,b=boxes[j]!.payload.position;
    if(a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height)add('DASHBOARD_LAYOUT_OVERLAP','/pages','Items '+boxes[i]!.id+' and '+boxes[j]!.id+' overlap on page '+module.id+'; rendering order is unspecified','warning');
   }
  }
 }
 if(p.kind==='dataset'){
  if(p.source.kind==='query')opaque('/source/query');
  for(const[name,field]of Object.entries(p.fields) as [string,DashboardField][]){
   if(field.role==='measure'&&!field.expression)add('DASHBOARD_MEASURE','/fields/'+pointer(name),'Measure fields declare their aggregate expression');
   if(field.expression)opaque('/fields/'+pointer(name)+'/expression');
  }
 }
 if(p.kind==='visual'){
  const dataset=resolve(p.dataset,'/dataset');const rule=charts[p.chart as DashboardChart];const counts=new Map<string,number>();
  for(const[index,encoding]of(p.encodings as DashboardEncoding[]).entries()){
   const path='/encodings/'+index;counts.set(encoding.channel,(counts.get(encoding.channel)??0)+1);
   if(!rule.allowed.includes(encoding.channel))add('DASHBOARD_ENCODING',path,'Channel '+encoding.channel+' is not used by a '+p.chart+' visual');
   const field=dataset?.fields[encoding.field];
   if(dataset&&!field)add('DASHBOARD_FIELD',path+'/field','Field is not declared by the dataset');
   if(field?.role==='measure'&&encoding.aggregation!=='measure')add('DASHBOARD_AGGREGATION',path,'Measure fields are used through their declared aggregate');
   if(field?.role==='column'&&encoding.aggregation==='measure')add('DASHBOARD_AGGREGATION',path,'Only measure fields use aggregation measure');
   if((encoding.aggregation==='custom')!==Boolean(encoding.expression))add('DASHBOARD_AGGREGATION',path,'A custom aggregation and an encoding expression require each other');
   if(p.rows==='detail'&&encoding.aggregation!=='none')add('DASHBOARD_AGGREGATION',path,'Detail rows are not aggregated');
   if(encoding.sort&&(encoding.sort.by==='custom')!==Boolean(encoding.sort.values))add('DASHBOARD_SORT',path+'/sort','Custom sort and explicit sort values require each other');
   if(encoding.expression)opaque(path+'/expression');
  }
  for(const channel of rule.required)if(!counts.has(channel))add('DASHBOARD_ENCODING','/encodings','A '+p.chart+' visual requires channel '+channel);
  for(const channel of singular)if((counts.get(channel)??0)>1)add('DASHBOARD_ENCODING','/encodings','Channel '+channel+' may appear only once');
 }
 if(p.kind==='filter'){
  const seen=new Set<string>();
  for(const[index,target]of(p.targets as DashboardFilter['targets']).entries()){
   const path='/targets/'+index;const key=JSON.stringify([target.dataset.module,target.dataset.element,target.field]);
   if(seen.has(key))add('DASHBOARD_FILTER',path,'Duplicate filter target');seen.add(key);
   const dataset=resolve(target.dataset,path+'/dataset');const field=dataset?.fields[target.field];
   if(dataset&&!field)add('DASHBOARD_FIELD',path+'/field','Field is not declared by the dataset');
   if(field?.role==='measure')add('DASHBOARD_FILTER',path,'Filters target column fields, not aggregate measures');
   if(p.control==='date-range'&&field?.type&&!['date','date-time'].includes(field.type))add('DASHBOARD_FILTER',path,'A date-range filter targets date or date-time fields');
  }
  if(p.control==='single-select'&&p.default&&p.default.values.length!==1)add('DASHBOARD_FILTER','/default','A single-select default has exactly one value');
 }
 return out;
}
export function dashboardRegistry():Registry{return new Registry().register(dashboardPackage,semantics);}
export function inspectDashboard(document:Document){return validateDocument(document,dashboardRegistry());}
function requireProfile(doc:Document):void {if(doc.vocabularies[DASHBOARD_EXTENSION]?.version!=='0.1.0'||(doc.extensions?.[DASHBOARD_EXTENSION] as any)?.kind!=='dashboard')throw new UmfError('DASHBOARD_PROFILE','Expected umf.dashboard 0.1.0 and a document-level dashboard');}
export function readDashboardDocument(text:string,format:'json'|'yaml'='yaml'):Document{const doc=readDocument(text,format);requireProfile(doc);const result=inspectDashboard(doc);if(!result.valid)throw new UmfError('DASHBOARD_DOCUMENT',JSON.stringify(result.diagnostics));return doc;}
export function writeDashboardDocument(doc:Document,format:'json'|'yaml'='yaml'):string{requireProfile(doc);const result=inspectDashboard(doc);if(!result.valid)throw new UmfError('DASHBOARD_DOCUMENT',JSON.stringify(result.diagnostics));return writeDocument(doc,format);}
export function getDashboardDefinition(doc:Document,module:string,element:string):DashboardDefinition{requireProfile(doc);if(!inspectDashboard(doc).valid)throw new UmfError('DASHBOARD_DOCUMENT','Invalid dashboard model');const value=doc.modules.find(m=>m.id===module)?.elements.find(e=>e.id===element)?.extensions[DASHBOARD_EXTENSION];if(!value)throw new UmfError('DASHBOARD_REFERENCE','Missing dashboard definition');return copyJson(value) as unknown as DashboardDefinition;}
export function editDashboardDefinition(doc:Document,module:string,element:string,update:(definition:DashboardDefinition)=>DashboardDefinition):Document{return editExtension(doc,dashboardRegistry(),module,element,DASHBOARD_EXTENSION,value=>update(value as unknown as DashboardDefinition) as unknown as Json);}

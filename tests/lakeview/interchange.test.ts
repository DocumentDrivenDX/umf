import {test,expect} from 'bun:test';
import {importLakeviewDashboard,exportLakeviewDashboard,inspectLakeview,inspectDashboard,getLakeviewNative,readDocument,writeDocument,copyJson,type Document} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
const source=await Bun.file('fixtures/lakeview/marketing-campaign.lvdash.json').text();
const authored=await Bun.file('fixtures/dashboard/marketing-campaign.json').json() as Document;
const native=()=>JSON.parse(source);
const compact=(text:string)=>renderTree(parseNativeJson(text));
const load=(text=source)=>importLakeviewDashboard(text,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'});
const element=(doc:Document,module:string,id:string)=>doc.modules.find(m=>m.id===module)?.elements.find(e=>e.id===id);
const neutral=(doc:Document,module:string,id:string)=>element(doc,module,id)?.extensions['umf.dashboard'] as any;
const widget=(view:any,name:string)=>view.pages.flatMap((p:any)=>p.layout).find((l:any)=>l.widget.name===name).widget;
const codes=(doc:Document)=>inspectLakeview(doc).diagnostics.filter(d=>d.severity==='error').map(d=>d.code);
test('@covers US-078-AC1: the marketing-campaign dashboard is retained by identity and exports token-exactly through UMF JSON/YAML',()=>{
 const {document}=load();
 expect(exportLakeviewDashboard(document)).toBe(compact(source));
 for(const format of ['json','yaml'] as const)expect(exportLakeviewDashboard(readDocument(writeDocument(document,format),format))).toBe(compact(source));
 expect(document.modules.map(m=>m.id)).toEqual(['data','overview','campaign_details','filters']);
 expect(document.modules.map(m=>(m.extensions!['umf.lakeview'] as any).kind)).toEqual(['data','page','page','page']);
 expect(document.modules[0]!.elements.map(e=>e.id)).toEqual(['ds_metric','ds_campaign','ds_rank','ds_weekday']);
 expect(document.modules.slice(1).flatMap(m=>m.elements).every(e=>(e.extensions['umf.lakeview'] as any).kind==='layout-item')).toBe(true);
 expect((document.extensions!['umf.lakeview'] as any).order).toEqual(['datasets','pages','uiSettings']);
 const checked=inspectLakeview(document);expect(checked.valid).toBe(true);expect(checked.complete).toBe(false);
 expect(checked.diagnostics.filter(d=>d.code.startsWith('LAKEVIEW_')).map(d=>d.code)).toEqual(['LAKEVIEW_CONTEXT_UNVERIFIED']);
 const view=native(),pi=view.pages.findIndex((p:any)=>p.name==='overview');
 expect(JSON.parse(getLakeviewNative(document,'overview','w-101-impressions'))).toEqual(view.pages[pi].layout[1]);
 expect(JSON.parse(getLakeviewNative(document,'overview'))).toEqual(view.pages[pi]);
 expect(JSON.parse(getLakeviewNative(document,'data','ds_rank'))).toEqual(view.datasets[2]);
 const copy=JSON.parse(getLakeviewNative(document));copy.pages.pop();expect(exportLakeviewDashboard(document)).toBe(compact(source));
});
test('@covers US-078-AC2: the neutral projection validates and agrees with the authored US-077 declaration',()=>{
 const {document}=load(),root=document.extensions!['umf.dashboard'] as any,fixtureRoot=authored.extensions!['umf.dashboard'] as any;
 expect(inspectDashboard(document).valid).toBe(true);
 expect(root.pages).toEqual(fixtureRoot.pages);expect(root.layout).toEqual(fixtureRoot.layout);
 expect(root.theme).toMatchObject(fixtureRoot.theme);
 const shape=(e:any)=>({channel:e.channel,field:e.field,aggregation:e.aggregation,scale:e.scale,sort:e.sort});
 for(const module of authored.modules){
  const fixture=module.extensions!['umf.dashboard'] as any,mine=document.modules.find(m=>m.id===module.id)!.extensions!['umf.dashboard'] as any;
  expect(mine.kind).toBe(fixture.kind);if(fixture.kind==='page')expect([mine.title,mine.role]).toEqual([fixture.title,fixture.role]);
  for(const item of module.elements){
   const expected=item.extensions['umf.dashboard'] as any,actual=neutral(document,module.id,item.id);
   expect(actual.kind).toBe(expected.kind);
   if(expected.kind==='dataset')for(const [name,field] of Object.entries<any>(expected.fields))if(field.role==='measure')expect(actual.fields[name].expression).toEqual(field.expression);else expect(actual.fields[name].role).toBe('column');
   if(expected.kind==='visual'){expect([actual.chart,actual.dataset,actual.rows]).toEqual([expected.chart,expected.dataset,expected.rows]);for(const encoding of expected.encodings)expect(actual.encodings.map(shape)).toContainEqual(shape(encoding));}
   if(expected.kind==='filter'){expect([actual.control,actual.default]).toEqual([expected.control,expected.default]);expect(actual.targets).toEqual(expect.arrayContaining(expected.targets));}
   if(expected.kind==='text')expect(actual.content.text.startsWith(expected.content.text.split('\n')[0])).toBe(true);
  }
 }
 expect(neutral(document,'overview','w-111-by-channel').encodings[1].sort).toEqual({by:'value-descending'});
 expect(neutral(document,'overview','w-101-impressions').encodings[0].format).toEqual({kind:'number',abbreviation:'compact',decimals:1});
 expect(neutral(document,'campaign_details','w-206-campaign-detail').rows).toBe('detail');
});
test('@covers US-078-AC3: constructs the neutral profile cannot express are reported with source pointers',()=>{
 const view=native(),w=(name:string)=>widget(view,name);
 w('w-101-impressions').queries[0].query.filters=[{expression:"`channel` <> 'Email'"}];
 view.datasets[0].parameters=[{displayName:'Week',keyword:'week',dataType:'DATE',defaultSelection:{values:{dataType:'DATE',values:[{value:'2027-07-31'}]}}}];
 w('filter-week-end').spec.selection={defaultSelection:{range:{dataType:'DATE',min:{value:'now-3M/M'},max:{value:'now-1M/M'}}}};
 w('w-115-by-visibility').spec.widgetType='sankey';
 w('w-102-clicks').spec.futureFlag=true;
 const text=JSON.stringify(view),{document,issues}=load(text);
 expect(exportLakeviewDashboard(document)).toBe(compact(text));
 const find=(code:string)=>issues.filter(i=>i.code===code).map(i=>[i.path,i.classification]);
 expect(find('LAKEVIEW_QUERY_FILTER')).toEqual([['/pages/0/layout/1/widget/queries/0/query/filters/0','unsupported']]);
 expect(find('LAKEVIEW_PARAMETER')).toEqual([['/datasets/0/parameters/0','unsupported']]);
 expect(find('LAKEVIEW_FILTER_DEFAULT')).toEqual([['/pages/2/layout/1/widget/spec/selection/defaultSelection/range','unsupported']]);
 expect(find('LAKEVIEW_WIDGET_TYPE')).toEqual([['/pages/0/layout/12/widget','unsupported']]);
 expect(find('LAKEVIEW_ORDER_BY')).toContainEqual(['/pages/1/layout/6/widget/queries/0/query/orders/0','unsupported']);
 expect(find('LAKEVIEW_STYLE')).toContainEqual(['/pages/0/layout/8/widget/spec/encodings/color','annotation-only']);
 expect(find('LAKEVIEW_STYLE')).toContainEqual(['/uiSettings/theme/widgetCornerRadius','annotation-only']);
 expect(find('LAKEVIEW_FORMAT')).toContainEqual(['/pages/0/layout/1/widget/spec/encodings/value/format/decimalPlaces/type','representation-change']);
 expect(find('LAKEVIEW_UNMAPPED')).toContainEqual(['/pages/0/layout/2/widget/spec/futureFlag','unsupported']);
 expect(find('LAKEVIEW_UNMAPPED')).toContainEqual(['/uiSettings/applyModeEnabled','unsupported']);
 const sankey=element(document,'overview','w-115-by-visibility')!;
 expect(Object.keys(sankey.extensions)).toEqual(['umf.lakeview']);
 expect(neutral(document,'overview','w-101-impressions').kind).toBe('visual');
 for(const issue of issues){let node:any=view;for(const key of issue.path.split('/').slice(1).map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~')))node=node[key];expect(node).toBeDefined();expect(issue.retainedInSource).toBe(true);}
});
test('@covers US-078-AC4: misplaced, inconsistent or unknown representation fails, legacy grids are doubled and rejected neutral items are omitted',()=>{
 const base=load().document;
 const mutate=(change:(doc:Document)=>void)=>{const doc=copyJson(base) as unknown as Document;change(doc);return doc;};
 const lv=(owner:any)=>owner.extensions['umf.lakeview'];
 const cases:[string,(doc:Document)=>void][]=[
  ['LAKEVIEW_PLACEMENT',d=>d.modules[1]!.elements.push(d.modules[0]!.elements.pop()!)],
  ['LAKEVIEW_PLACEMENT',d=>d.modules[0]!.elements.push(d.modules[1]!.elements.pop()!)],
  ['LAKEVIEW_SCOPE',d=>d.modules[1]!.elements[0]!.extensions['umf.lakeview']=lv(d.modules[1])],
  ['LAKEVIEW_ROOT',d=>delete d.extensions!['umf.lakeview']],
  ['LAKEVIEW_ORDER',d=>lv(d).order=['pages','uiSettings']],
  ['LAKEVIEW_ORDER',d=>lv(d).order=['datasets','pages','uiSettings','missing']],
  ['LAKEVIEW_ORDER',d=>lv(d.modules[1]).order=lv(d.modules[1]).order.filter((k:string)=>k!=='layout')],
  ['LAKEVIEW_ORDER',d=>lv(d.modules[1]).order=[...lv(d.modules[1]).order].reverse()],
  ['LAKEVIEW_ORDER',d=>lv(d.modules[1]).native.members.layout={kind:'array',items:[]}],
  ['LAKEVIEW_NATIVE',d=>lv(d.modules[0]!.elements[0]).native={kind:'array',items:[]}]
 ];
 for(const [code,change] of cases){const doc=mutate(change);expect(codes(doc)).toContain(code);expect(()=>exportLakeviewDashboard(doc)).toThrow();}
 const wrapped=mutate(d=>lv(d.modules[0]!.elements[0]).note='kept');
 expect(inspectLakeview(wrapped).valid).toBe(true);expect(()=>exportLakeviewDashboard(wrapped)).toThrow('Unknown representation fields');
 const legacy=native();delete legacy.pages[1].layoutVersion;
 const grid=load(JSON.stringify(legacy));
 expect(grid.issues.filter(i=>i.code==='LAKEVIEW_GRID').map(i=>i.path)).toEqual(['/pages/1']);
 // A six-wide item doubles to the full twelve-column row; a full-row item no longer fits and is omitted.
 expect(neutral(grid.document,'campaign_details','w-201-campaigns-run').position).toEqual({x:0,y:3,width:12,height:4});
 expect(neutral(grid.document,'campaign_details','w-206-campaign-detail')).toBeUndefined();
 expect(grid.issues).toContainEqual(expect.objectContaining({path:'/pages/1/layout/6/widget',code:'LAKEVIEW_PROJECTION',detail:expect.stringContaining('DASHBOARD_LAYOUT')}));
 const rejected=native();delete widget(rejected,'w-112-by-traffic-source').spec.encodings.y;
 const omitted=load(JSON.stringify(rejected));
 expect(neutral(omitted.document,'overview','w-112-by-traffic-source')).toBeUndefined();
 expect(omitted.issues).toContainEqual(expect.objectContaining({path:'/pages/0/layout/9/widget',code:'LAKEVIEW_PROJECTION',detail:expect.stringContaining('DASHBOARD_ENCODING')}));
 expect(exportLakeviewDashboard(omitted.document)).toBe(compact(JSON.stringify(rejected)));
},60_000);

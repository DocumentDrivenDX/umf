import {test,expect} from 'bun:test';
import {readDashboardDocument,writeDashboardDocument,inspectDashboard,getDashboardDefinition,editDashboardDefinition,copyJson,type Document} from '../../src';
const input=await Bun.file('fixtures/dashboard/marketing-campaign.json').text();
const fresh=()=>JSON.parse(input) as Document;
const module=(doc:Document,id:string)=>doc.modules.find(m=>m.id===id)!;
const payload=(doc:Document,moduleId:string,element:string)=>module(doc,moduleId).elements.find(e=>e.id===element)!.extensions['umf.dashboard'] as any;
const root=(doc:Document)=>doc.extensions!['umf.dashboard'] as any;
const move=(doc:Document,from:string,element:string,to:string)=>{const source=module(doc,from);const index=source.elements.findIndex(e=>e.id===element);module(doc,to).elements.push(...source.elements.splice(index,1));};
// Replace every retained expression with an interpreted equivalent so the model is completely understood.
const understood=()=>{
 const doc=fresh();
 const campaign=payload(doc,'data','ds_campaign'),metric=payload(doc,'data','ds_metric');
 campaign.source={kind:'table',table:'main.marketing.v_campaign_detail'};metric.source={kind:'table',table:'main.marketing.v_campaign_metric'};
 delete campaign.fields['Total Impressions'];delete campaign.fields['Prior Week Impressions'];campaign.fields.impressions={role:'column',type:'integer'};
 delete metric.fields['Metric Value'];metric.fields.metric_num={role:'column',type:'decimal'};
 payload(doc,'overview','w-101-impressions').encodings=[{channel:'value',field:'impressions',aggregation:'sum'}];
 for(const id of ['w-110-weekly-trend','w-111-by-channel'])for(const encoding of payload(doc,'overview',id).encodings)if(encoding.field==='Metric Value')Object.assign(encoding,{field:'metric_num',aggregation:'sum'});
 return doc;
};
test('@covers US-077-AC1: the authored dashboard survives JSON/YAML with page order, datasets, visuals, text and cross-dataset filters',()=>{
 const doc=readDashboardDocument(input,'json');
 for(const format of ['json','yaml'] as const)expect(readDashboardDocument(writeDashboardDocument(doc,format),format)).toEqual(doc);
 const checked=inspectDashboard(doc);expect(checked.valid).toBe(true);expect(checked.complete).toBe(false);
 expect(new Set(checked.diagnostics.map(d=>d.code))).toEqual(new Set(['DASHBOARD_EXPRESSION_OPAQUE']));
 expect(checked.diagnostics.map(d=>d.path)).toEqual(['/modules/0/elements/0/extensions/umf.dashboard/source/query','/modules/0/elements/0/extensions/umf.dashboard/fields/Total Impressions/expression','/modules/0/elements/0/extensions/umf.dashboard/fields/Prior Week Impressions/expression','/modules/0/elements/1/extensions/umf.dashboard/source/query','/modules/0/elements/1/extensions/umf.dashboard/fields/Metric Value/expression']);
 expect(root(doc).pages).toEqual(['overview','campaign_details','filters']);
 const channel=getDashboardDefinition(doc,'filters','filter-channel') as any;
 expect(channel.targets.map((t:any)=>t.dataset.element)).toEqual(['ds_metric','ds_campaign']);
 channel.targets.pop();
 expect((getDashboardDefinition(doc,'filters','filter-channel') as any).targets).toHaveLength(2);
});
test('@covers US-077-AC2: placement, reference, field, aggregation, encoding, filter, layout and trace contradictions fail semantic checks',()=>{
 const mutations:[string,(doc:Document)=>void][]=[
  ['DASHBOARD_SCOPE',d=>module(d,'overview').elements[0]!.extensions['umf.dashboard']={kind:'page',title:'Wrong',role:'canvas'}],
  ['DASHBOARD_PLACEMENT',d=>move(d,'overview','w-101-impressions','data')],
  ['DASHBOARD_PLACEMENT',d=>move(d,'data','ds_metric','overview')],
  ['DASHBOARD_GLOBAL_FILTERS',d=>move(d,'overview','w-111-by-channel','filters')],
  ['DASHBOARD_PAGES',d=>root(d).pages=['overview','campaign_details']],
  ['DASHBOARD_PAGES',d=>root(d).pages.push('overview')],
  ['DASHBOARD_PAGES',d=>root(d).pages.push('data')],
  ['DASHBOARD_ROOT',d=>delete d.extensions!['umf.dashboard']],
  ['DASHBOARD_REFERENCE',d=>payload(d,'overview','w-101-impressions').dataset.element='missing'],
  ['DASHBOARD_REFERENCE',d=>payload(d,'filters','filter-metric').targets[0].dataset={module:'overview',element:'ov-header'}],
  ['DASHBOARD_FIELD',d=>payload(d,'overview','w-110-weekly-trend').encodings[0].field='week_start'],
  ['DASHBOARD_FIELD',d=>payload(d,'filters','filter-channel').targets[1].field='traffic_source'],
  ['DASHBOARD_AGGREGATION',d=>payload(d,'overview','w-101-impressions').encodings[0].aggregation='sum'],
  ['DASHBOARD_AGGREGATION',d=>payload(d,'overview','w-110-weekly-trend').encodings[0].aggregation='measure'],
  ['DASHBOARD_AGGREGATION',d=>payload(d,'overview','w-111-by-channel').encodings[1].aggregation='custom'],
  ['DASHBOARD_AGGREGATION',d=>payload(d,'campaign_details','w-206-campaign-detail').encodings[3].aggregation='sum'],
  ['DASHBOARD_MEASURE',d=>delete payload(d,'data','ds_campaign').fields['Total Impressions'].expression],
  ['DASHBOARD_ENCODING',d=>payload(d,'overview','w-101-impressions').encodings.shift()],
  ['DASHBOARD_ENCODING',d=>payload(d,'overview','w-110-weekly-trend').encodings[0].channel='value'],
  ['DASHBOARD_ENCODING',d=>payload(d,'overview','w-110-weekly-trend').encodings[1].channel='x'],
  ['DASHBOARD_SORT',d=>payload(d,'overview','w-111-by-channel').encodings[1].sort={by:'custom'}],
  ['DASHBOARD_FILTER',d=>payload(d,'filters','filter-channel').targets.push(payload(d,'filters','filter-channel').targets[0])],
  ['DASHBOARD_FILTER',d=>payload(d,'filters','filter-metric').targets[0].field='Metric Value'],
  ['DASHBOARD_FILTER',d=>payload(d,'filters','filter-week-end').targets[0].field='channel'],
  ['DASHBOARD_FILTER',d=>payload(d,'filters','filter-metric').default.values.push('Clicks')],
  ['DASHBOARD_LAYOUT',d=>payload(d,'overview','w-111-by-channel').position.x=10],
  ['DASHBOARD_TRACE',d=>payload(d,'overview','w-111-by-channel').trace='W-101'],
  ['EXTENSION_STRUCTURE',d=>root(d).theme.palette.push('blue')]
 ];
 for(const[code,mutate]of mutations){const doc=fresh();mutate(doc);const checked=inspectDashboard(doc);expect(checked.valid,code).toBe(false);expect(checked.diagnostics.some(d=>d.code===code),code).toBe(true);expect(()=>writeDashboardDocument(doc)).toThrow();}
});
test('@covers US-077-AC3: unknown content, overlapping layout and opaque expressions survive but block conservative edits',()=>{
 const doc=understood();payload(doc,'overview','w-111-by-channel').interaction={tableauAction:'filter-on-select'};
 payload(doc,'overview','w-111-by-channel').position.y=10;
 const returned=readDashboardDocument(writeDashboardDocument(doc));expect(returned).toEqual(doc);
 const codes=inspectDashboard(doc).diagnostics.map(d=>d.code);
 expect(codes).toContain('DASHBOARD_UNKNOWN');expect(codes).toContain('DASHBOARD_LAYOUT_OVERLAP');
 expect(()=>editDashboardDefinition(doc,'overview','w-111-by-channel',value=>value)).toThrow('validated');
 expect(()=>editDashboardDefinition(fresh(),'overview','w-111-by-channel',value=>value)).toThrow('validated');
});
test('@covers US-077-AC4: fully understood dashboard edits are atomic and reject invalid results',()=>{
 const doc=understood();expect(inspectDashboard(doc).complete).toBe(true);
 const snapshot=copyJson(doc) as unknown as Document;
 const edited=editDashboardDefinition(doc,'overview','w-111-by-channel',value=>({...value,title:'Selected metric by channel'}));
 expect(doc).toEqual(snapshot);expect((getDashboardDefinition(edited,'overview','w-111-by-channel') as any).title).toBe('Selected metric by channel');
 expect(()=>editDashboardDefinition(doc,'overview','w-111-by-channel',value=>({...value,chart:'pie'}) as any)).toThrow();
 expect(()=>editDashboardDefinition(doc,'overview','w-111-by-channel',value=>({...value,position:{x:10,y:12,width:4,height:5}}) as any)).toThrow();
 expect(doc).toEqual(snapshot);
});

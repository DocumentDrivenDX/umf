/** Selected search declaration admission. Native capability proof stays at catalog build. */
import type {Document} from '../../index';
import type {Ref,ResolvedRecord,ResolvedSearch} from '../ir/index';
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,required:string[],optional:string[]=[]):v is Record<string,unknown>=>object(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const ref=(v:unknown):v is Ref=>exact(v,['module','element'])&&typeof v.module==='string'&&typeof v.element==='string';
const same=(a:Ref,b:Ref)=>a.module===b.module&&a.element===b.element;
export function inspectSelectedSearch(document:Document,records:ResolvedRecord[],add:(code:string,pointer:string)=>void):ResolvedSearch[]{
 const out:ResolvedSearch[]=[],seen=new Set<string>();
 for(const [mi,sourceModule] of document.modules.entries()){
  const payload=sourceModule.extensions?.['umf.access'];if(!object(payload)||!Array.isArray(payload.search)||!Array.isArray(payload.searchBindings))continue;
  for(const [ii,index] of payload.search.entries()){
   if(!object(index)||!ref(index.record))continue;
   const record=records.find(r=>r.selected&&same(r.ref,index.record as unknown as Ref));if(!record)continue;
   const path=`/modules/${mi}/extensions/umf.access/search/${ii}`;
   const refuse=()=>add('SEARCH_DECLARATION',path);
   if(!exact(index,['id','record','kind','exactness','filterable'],['vector','keyword'])||typeof index.id!=='string'||!index.id||seen.has(index.id)||!['vector','keyword'].includes(String(index.kind))||!['exact','approximate'].includes(String(index.exactness))||!Array.isArray(index.filterable)||index.filterable.some(f=>!ref(f)||!record.fields.some(field=>field.owned!==false&&same(field.ref,f)))){refuse();continue;}
   seen.add(index.id);
   if(index.kind==='keyword'){
    const keyword=index.keyword;
    if(index.vector!==undefined||!exact(keyword,['source','ranking','analyzer','syntax'])||!object(keyword)||!Array.isArray(keyword.source)||!keyword.source.length||keyword.source.some(f=>!ref(f)||!record.fields.some(field=>field.owned!==false&&same(field.ref,f)&&field.scalarType==='string'&&field.cardinality==='one'))||keyword.syntax!=='plain'||!exact(keyword.ranking,['family'],['k1','b'])||!object(keyword.ranking)||!['bm25','implementation-defined'].includes(String(keyword.ranking.family))||keyword.analyzer!=='implementation-defined'&&(!exact(keyword.analyzer,['language','stemming'])||!object(keyword.analyzer)||typeof keyword.analyzer.language!=='string'||typeof keyword.analyzer.stemming!=='boolean')){refuse();continue;}
    const ranking=keyword.ranking as Record<string,unknown>;
    if(['k1','b'].some(k=>ranking[k]!==undefined&&(typeof ranking[k]!=='number'||!Number.isFinite(ranking[k])))){refuse();continue;}
   }else{
    const vector=index.vector;
    if(index.keyword!==undefined||!exact(vector,['field','model','dimensions','metric','computedBy'],['source'])||!object(vector)||!ref(vector.field)||!exact(vector.model,['id','version'])||!object(vector.model)||typeof vector.model.id!=='string'||typeof vector.model.version!=='string'||!Number.isSafeInteger(vector.dimensions)||Number(vector.dimensions)<1||Number(vector.dimensions)>16000||!['cosine','dot','l2'].includes(String(vector.metric))||!['host','target'].includes(String(vector.computedBy))||vector.source!==undefined&&(!ref(vector.source)||!record.fields.some(f=>same(f.ref,vector.source as unknown as Ref)&&f.scalarType==='string'&&f.cardinality==='one'))){refuse();continue;}
    const field=record.fields.find(f=>f.owned!==false&&same(f.ref,vector.field as unknown as Ref));const leaf=field?.item&&record.fields.find(f=>same(f.ref,field.item!));
    if(!field||field.cardinality!=='array'||!leaf||leaf.scalarType!=='float'||leaf.cardinality!=='one'||leaf.row.missing||leaf.row.null||leaf.owned!==false||Object.keys(leaf.facets).length||leaf.properties.allowedValues!==undefined){refuse();continue;}
    const size=field.facets.collectionSize;if(!object(size)||size.min!==vector.dimensions||size.max!==vector.dimensions||field.vectorDimensions!==undefined&&field.vectorDimensions!==vector.dimensions){refuse();continue;}
    field.vectorDimensions=Number(vector.dimensions);leaf.vectorComponent=true;
   }
   const bindings:Record<string,unknown>[]=[];const targets=new Set<string>();
   for(const [bi,binding] of payload.searchBindings.entries())if(object(binding)&&binding.index===index.id){
    const bp=`/modules/${mi}/extensions/umf.access/searchBindings/${bi}`;
    if(!exact(binding,['index','target','native','freshness','maxK','filtering'])||!exact(binding.target,['platform','majorVersion'])||!object(binding.target)||!['postgresql','lakebase','spark-delta','unity-catalog'].includes(String(binding.target.platform))||typeof binding.target.majorVersion!=='string'||typeof binding.native!=='string'||!binding.native||!['transactional','asynchronous'].includes(String(binding.freshness))||!['complete','partial'].includes(String(binding.filtering))||!Number.isSafeInteger(binding.maxK)||Number(binding.maxK)<1||Number(binding.maxK)>1000||targets.has(JSON.stringify(binding.target))){add('SEARCH_DECLARATION',bp);continue;}
    targets.add(JSON.stringify(binding.target));bindings.push(binding);
   }
   out.push({record:record.ref,id:index.id,python:'',pointer:path,declaration:index,bindings});
  }
 }
 return out;
}

import {copyJson} from '../../model/json';
import {pointer,UmfError,type Document} from '../../model/types';
import {inspectDdd,type DddEntity} from '../../extensions/ddd';
import {exportGraphqlSchema,importGraphqlSchema} from '../../adapters/graphql';

export interface DddGraphqlEntityName {module:string;element:string;name:string}
export interface DddGraphqlFieldName {module:string;element:string;field:string;name:string;coreField?:{module:string;element:string}}
export interface DddGraphqlEntityPolicy {
  entities:DddGraphqlEntityName[];fields:DddGraphqlFieldName[];
  scalars:{string:string;boolean:string;integer:string;decimal:string;'date-time':string;bytes:string};
  root:{kind:'synthetic-schema-root';typeName:string;fieldName:string};
  sourceProfile?:'ddd-only'|'core-ideals';
}
export interface DddGraphqlEntityResidual {path:string;reason:string;choice:unknown}
export interface DddGraphqlEntityMapping {sourcePath:string;target:string}
export interface DddGraphqlEntityProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;policy:DddGraphqlEntityPolicy;
  profile:'graphql-js-17.0.2-sdl';residuals:DddGraphqlEntityResidual[];mappings:DddGraphqlEntityMapping[];
  candidate?:string;targetArchive?:Document;
}
const name=/^[_A-Za-z][_0-9A-Za-z]*$/;
const valid=(value:string)=>typeof value==='string'&&name.test(value)&&!value.startsWith('__');
const key=(r:{module:string;element:string;field?:string})=>JSON.stringify([r.module,r.element,r.field??null]);
const scalarKind:{[K in 'string'|'boolean'|'integer'|'decimal'|'date-time'|'bytes']:string}={string:'string',boolean:'boolean',integer:'integer',decimal:'decimal','date-time':'timestamp',bytes:'binary'};

/** Relationship-independent DDD entity SDL with an explicit schema-only root. */
export function projectDddEntitiesToGraphql(logical:Document,policy:DddGraphqlEntityPolicy,lossPolicy:'strict'|'report'):DddGraphqlEntityProjection{
  const checked=inspectDdd(logical);
  if(!checked.valid||checked.diagnostics.some(d=>d.code==='DDD_UNKNOWN'))throw new UmfError('DDD_DOCUMENT','Invalid or uninterpreted DDD model');
  if(logical.modules.some(m=>Object.hasOwn(m,'relationships')))throw new UmfError('GRAPHQL_RELATIONSHIP_GATE','Relationship assertions require the full projection');
  if(!policy||!Array.isArray(policy.entities)||!Array.isArray(policy.fields)||!policy.scalars||!policy.root||Object.keys(policy).some(k=>!['entities','fields','scalars','root','sourceProfile'].includes(k)))throw new UmfError('GRAPHQL_POLICY','Explicit entity, field, scalar and root policy required');
  const coreProfile=policy.sourceProfile==='core-ideals';
  if(policy.sourceProfile!==undefined&&!['ddd-only','core-ideals'].includes(policy.sourceProfile))throw new UmfError('GRAPHQL_POLICY','Unknown source profile');
  if(coreProfile&&logical.umf!=='0.5.0')throw new UmfError('GRAPHQL_CORE_VERSION','Core Field/Nullability/Cardinality profile requires UMF 0.5.0');
  if(policy.root.kind!=='synthetic-schema-root'||!valid(policy.root.typeName)||!valid(policy.root.fieldName)||Object.keys(policy.root).some(k=>!['kind','typeName','fieldName'].includes(k)))throw new UmfError('GRAPHQL_ROOT','Invalid synthetic schema root policy');
  const scalarFamilies=['string','boolean','integer','decimal','date-time','bytes'] as const;
  if(Object.keys(policy.scalars).length!==scalarFamilies.length||scalarFamilies.some(f=>!valid(policy.scalars[f])))throw new UmfError('GRAPHQL_SCALAR_POLICY','Every DDD scalar family needs one valid GraphQL name');
  const builtins=new Set(['String','Boolean','Int','Float','ID']);
  if(policy.scalars.string!=='String'||policy.scalars.boolean!=='Boolean'||policy.scalars.integer!=='Int'&&builtins.has(policy.scalars.integer)||['decimal','date-time','bytes'].some(f=>builtins.has(policy.scalars[f as 'decimal'|'date-time'|'bytes']))||new Set(Object.values(policy.scalars)).size!==scalarFamilies.length)throw new UmfError('GRAPHQL_SCALAR_POLICY','Scalar families need distinct safe carriers; decimal, temporal and bytes require custom scalars');
  const names=new Set<string>([policy.root.typeName]),entities=new Map<string,DddGraphqlEntityName>(),fields=new Map<string,DddGraphqlFieldName>(),coreRefs=new Set<string>();
  for(const row of policy.entities){
    if(!row||typeof row.module!=='string'||typeof row.element!=='string'||!valid(row.name)||Object.keys(row).some(k=>!['module','element','name'].includes(k))||entities.has(key(row))||names.has(row.name)||builtins.has(row.name))throw new UmfError('GRAPHQL_ENTITY_NAME','Invalid, duplicate or reserved entity name');
    entities.set(key(row),row);names.add(row.name);
  }
  if(!entities.size)throw new UmfError('GRAPHQL_ENTITY_SELECTION','At least one DDD entity is required');
  for(const family of scalarFamilies){const mapped=policy.scalars[family];if(names.has(mapped))throw new UmfError('GRAPHQL_SCALAR_NAME','Scalar name collides with an object or root type');}
  for(const row of policy.fields){
    if(!row||typeof row.module!=='string'||typeof row.element!=='string'||typeof row.field!=='string'||!valid(row.name)||Object.keys(row).some(k=>!['module','element','field','name','coreField'].includes(k))||fields.has(key(row)))throw new UmfError('GRAPHQL_FIELD_NAME','Invalid or duplicate GraphQL field mapping');
    const owner=logical.modules.find(m=>m.id===row.module)?.elements.find(e=>e.id===row.element)?.extensions?.['umf.ddd'] as DddEntity|undefined;
    if(owner?.kind!=='entity'||!Object.hasOwn(owner.fields,row.field))throw new UmfError('GRAPHQL_FIELD_REFERENCE','Field mapping has no exact DDD field');
    if(coreProfile){
      if(owner.fields[row.field]?.type.kind!=='scalar')throw new UmfError('GRAPHQL_CORE_REFERENCE','Core Field pairing is only defined for a DDD scalar field');
      if(!row.coreField||typeof row.coreField.module!=='string'||typeof row.coreField.element!=='string'||Object.keys(row.coreField).some(k=>!['module','element'].includes(k)))throw new UmfError('GRAPHQL_CORE_REFERENCE','Core-ideals profile requires one exact Field reference per selected DDD field');
      const ref=key(row.coreField);if(coreRefs.has(ref))throw new UmfError('GRAPHQL_CORE_REFERENCE','A core Field cannot silently bind two DDD fields');coreRefs.add(ref);
    }else if(row.coreField!==undefined)throw new UmfError('GRAPHQL_CORE_REFERENCE','DDD-only profile cannot ignore a core Field reference');
    fields.set(key(row),row);
  }
  const residuals:DddGraphqlEntityResidual[]=[],mappings:DddGraphqlEntityMapping[]=[],definitions:string[]=[];
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  const custom=new Set<string>();
  add('/policy/root','Synthetic query root has no resolver or execution meaning',policy.root);
  for(const moduleId of new Set(policy.entities.map(row=>row.module))){
    const mi=logical.modules.findIndex(m=>m.id===moduleId),module=logical.modules[mi];
    if(module)add(`/modules/${mi}/extensions/umf.ddd`,'DDD bounded-context namespace and terms are retained but not expressed in SDL',{namespace:module.namespace,context:module.extensions?.['umf.ddd']});
  }
  for(const row of policy.entities){
    const mi=logical.modules.findIndex(m=>m.id===row.module),module=logical.modules[mi];
    const ei=module?.elements.findIndex(e=>e.id===row.element)??-1,element=module?.elements[ei];
    const ddd=element?.extensions?.['umf.ddd'] as DddEntity|undefined;
    if(ddd?.kind!=='entity')throw new UmfError('GRAPHQL_ENTITY_REFERENCE','Selected reference must resolve to a DDD entity');
    const base=`/modules/${mi}/elements/${ei}/extensions/umf.ddd`;
    const lines:string[]=[],used=new Set<string>();
    for(const [fieldName,field] of Object.entries(ddd.fields)){
      const path=base+'/fields/'+pointer(fieldName),chosen=fields.get(key({...row,field:fieldName}));
      if(!chosen){add(path,'Field has no explicit GraphQL name',field);continue;}
      if(used.has(chosen.name))throw new UmfError('GRAPHQL_FIELD_NAME','GraphQL field name collision inside one object');
      used.add(chosen.name);
      if(field.type.kind!=='scalar'){add(path,'Concept-valued field needs a separate by-value or relationship projection',field);continue;}
      let type=policy.scalars[field.type.name];
      if(!builtins.has(type))custom.add(type);
      if(coreProfile){
        const ref=chosen.coreField!,coreMi=logical.modules.findIndex(m=>m.id===ref.module),coreModule=logical.modules[coreMi];
        const coreEi=coreModule?.elements.findIndex(e=>e.id===ref.element)??-1,core=coreModule?.elements[coreEi];
        if(core?.kind!=='field')throw new UmfError('GRAPHQL_CORE_REFERENCE','Paired core element must be an exact Field');
        const corePath=`/modules/${coreMi}/elements/${coreEi}`;
        if(checked.diagnostics.some(d=>d.path.startsWith(corePath+'/')&&d.code.startsWith('UNKNOWN_')))throw new UmfError('GRAPHQL_CORE_INCOMPLETE','Selected core Field has uninterpreted content');
        if(field.cardinality==='many'){
          if(core.cardinality!=='array'||core.scalarType!==undefined||!core.itemType)throw new UmfError('GRAPHQL_CORE_CONTAINER','DDD many needs a core array Field with an explicit itemType');
          const itemRef=core.itemType as {module?:unknown;element?:unknown};
          if(typeof itemRef.module!=='string'||typeof itemRef.element!=='string')throw new UmfError('GRAPHQL_CORE_CONTAINER','Invalid array item Field reference');
          const itemMi=logical.modules.findIndex(m=>m.id===itemRef.module),itemModule=logical.modules[itemMi];
          const itemEi=itemModule?.elements.findIndex(e=>e.id===itemRef.element)??-1,item=itemModule?.elements[itemEi];
          if(item?.kind!=='field'||item.scalarType!==scalarKind[field.type.name]||item.cardinality!=='one'||item.itemType!==undefined)throw new UmfError('GRAPHQL_CORE_SCALAR','Array item Field scalar/container conflicts with the DDD field');
          const itemPath=`/modules/${itemMi}/elements/${itemEi}`;
          if(checked.diagnostics.some(d=>d.path.startsWith(itemPath+'/')&&d.code.startsWith('UNKNOWN_')))throw new UmfError('GRAPHQL_CORE_INCOMPLETE','Selected item Field has uninterpreted content');
          if(item.nullability==='required')type='['+type+'!]';
          else if(item.nullability==='absent-allowed'){type='['+type+']';add(itemPath+'/nullability','Nullable GraphQL item does not preserve absent-versus-present-null meaning',item.nullability);}
          else if(item.nullability==='unspecified'){type='['+type+']';add(itemPath+'/nullability','Array item availability is unspecified',item.nullability);}
          else throw new UmfError('GRAPHQL_CORE_NULLABILITY','Array item availability must be explicit');
          if(item.facets!==undefined)add(itemPath+'/facets','SDL does not enforce item facets',item.facets);
          mappings.push({sourcePath:itemPath,target:row.name+'.'+chosen.name+'[]'});
          add(path,'DDD many does not define GraphQL list order or duplicate behavior',field);
        }else{
          if(core.cardinality!=='one'||core.scalarType!==scalarKind[field.type.name]||core.itemType!==undefined)throw new UmfError('GRAPHQL_CORE_SCALAR','Core scalar Field conflicts with the DDD field');
        }
        if(field.cardinality==='one'&&core.nullability==='absent-allowed'||field.cardinality==='optional'&&core.nullability==='required')throw new UmfError('GRAPHQL_CORE_NULLABILITY','DDD and core availability assertions conflict');
        if(core.nullability==='required')type+='!';
        else if(core.nullability==='absent-allowed')add(corePath+'/nullability','GraphQL nullable result does not distinguish absent value from present null',core.nullability);
        else if(core.nullability==='unspecified'){
          add(corePath+'/nullability','Core availability is unspecified; SDL remains nullable',core.nullability);
          if(field.cardinality==='one')add(path,'DDD one requires a value, but core availability does not justify SDL non-null',field);
        }
        else throw new UmfError('GRAPHQL_CORE_NULLABILITY','Core Field availability must be explicit');
        if(core.facets!==undefined)add(corePath+'/facets','SDL does not enforce core scalar/container facets',core.facets);
        mappings.push({sourcePath:corePath,target:row.name+'.'+chosen.name});
      }else if(field.cardinality==='one')type+='!';
      else if(field.cardinality==='many'){type='['+type+']';add(path,'DDD many does not define GraphQL list order, duplicate or item-null behavior',field);}
      else add(path,'GraphQL nullable result does not distinguish absent DDD value from present null',field);
      if(field.type.name==='integer'&&policy.scalars.integer==='Int')add(path,coreProfile?'GraphQL Int is signed 32-bit; DDD integer and core domain need explicit compatibility evidence':'GraphQL Int is signed 32-bit; DDD integer has no such bound',field);
      if(field.type.name==='string')add(path,'GraphQL String coercion and Unicode equality are not defined by DDD scalar naming',field);
      lines.push(`  ${chosen.name}: ${type}`);mappings.push({sourcePath:path,target:row.name+'.'+chosen.name});
    }
    if(!lines.length)throw new UmfError('GRAPHQL_ENTITY_EMPTY','Selected entity has no safe output field');
    definitions.push(`type ${row.name} {\n${lines.join('\n')}\n}`);
    mappings.push({sourcePath:base,target:row.name});
    add(base+'/identity','GraphQL object type does not enforce DDD identity or lifecycle scope',ddd.identity);
    if(ddd.aggregate)add(base+'/aggregate','GraphQL SDL does not enforce DDD aggregate boundary',ddd.aggregate);
    for(const [i,invariant] of (ddd.invariants??[]).entries())add(base+`/invariants/${i}`,'DDD invariant is retained but not interpreted or enforced',invariant);
  }
  for(const row of policy.fields)if(!entities.has(key({module:row.module,element:row.element})))throw new UmfError('GRAPHQL_FIELD_REFERENCE','Field mapping has no selected entity');
  for(const family of scalarFamilies)if(custom.has(policy.scalars[family]))add('/policy/scalars/'+family,'Custom scalar coercion and serialization are outside SDL',policy.scalars[family]);
  const customDefinitions=[...custom].sort().map(s=>'scalar '+s);
  const candidate=`schema { query: ${policy.root.typeName} }\n\ntype ${policy.root.typeName} {\n  ${policy.root.fieldName}: Boolean\n}\n\n${[...customDefinitions,...definitions].join('\n\n')}\n`;
  let targetArchive:Document;
  try{targetArchive=importGraphqlSchema(candidate,{id:'ddd-graphql-entities-target',mode:'schema'});if(exportGraphqlSchema(targetArchive)!==candidate)throw Error('Native SDL source changed');}
  catch(error){throw new UmfError('GRAPHQL_TARGET',`Generated SDL failed schema-mode import: ${String(error)}`);}
  const status:DddGraphqlEntityProjection['status']=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'proposed';
  return {status,logical:copyJson(logical) as unknown as Document,policy:copyJson(policy) as unknown as DddGraphqlEntityPolicy,profile:'graphql-js-17.0.2-sdl',residuals,mappings,...(status==='blocked'?{}:{candidate,targetArchive})};
}

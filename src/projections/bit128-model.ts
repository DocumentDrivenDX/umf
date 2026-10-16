import modelSchema from '../../spec/projections/bit128-model.schema.json';
import document09 from '../../spec/core/bit128-document.schema.json';
import document01 from '../../spec/core/schema.json';
import {createValidator} from '../validation/schema';
import {snapshotSchema} from '../validation/internal-schema';
import {renderBit128FileModel} from './bit128-file-model';
import {copyJson} from '../model/json';
import {UmfError,type Document,type Json} from '../model/types';
import {canonicalSchemaJson} from '../model/schema-literals';
import {inspectBit128Binding,type Bit128BindingPayload} from '../extensions/binding/bit128';
import {resolveBit128ModelLayout,type Resolved128Layout} from '../extensions/binding/bit128-layout';
import {bit128SqlServerSessionStatements,renderBit128SqlModel,type Bit128ModelResidual} from './bit128-sql-model';
import {assertBit128OutputBudget} from './bit128-output-budget';
const validator=createValidator();validator.addSchema(snapshotSchema(document09));validator.addSchema(snapshotSchema(document01));const check=validator.compile(snapshotSchema(modelSchema));
export interface Bit128ModelProjection {
 operation:'project-bit128-model';version:'1.0.0';source:Document;binding:Document;lossPolicy:'strict'|'report';
 status:'projected'|'reported'|'blocked';nativeRequirements:{scope:'connection';statements:string[]}[];residuals:Bit128ModelResidual[];
 mappings:{record:{module:string;element:string};table:string;fields:{identity:{module:string;element:string};slots:string[];paths:string[][]}[]}[];
 candidate?:{format:'sql'|'avro'|'parquet'|'tablespec';text:string};
}
export function resolveBit128ModelSources(bindingInput:Document,sourceInput:Document):{binding:Document;source:Document;payload:Bit128BindingPayload;layout:Resolved128Layout}{
 const binding=copyJson(bindingInput) as unknown as Document,source=copyJson(sourceInput) as unknown as Document;
 const validation=inspectBit128Binding(binding,source);
 if(!validation.valid||!validation.complete)throw new UmfError('BIT128_MODEL_SOURCE',JSON.stringify(validation.diagnostics));
 const payload=binding.extensions!['umf.binding'] as unknown as Bit128BindingPayload;
 const layout=resolveBit128ModelLayout(payload,source);
 return {binding,source,payload,layout};
}
/** Complete declared128-bit Record models. Unsupported meanings block or remain explicit residuals. */
export function projectBit128Model(bindingInput:Document,sourceInput:Document,lossPolicy:'strict'|'report'):Bit128ModelProjection {
 if(!['strict','report'].includes(lossPolicy))throw new UmfError('BIT128_MODEL_POLICY','Explicit strict/report policy required');
 const {binding,source,payload,layout}=resolveBit128ModelSources(bindingInput,sourceInput),residuals:Bit128ModelResidual[]=[];
 const {system,version}=payload.target;
 let candidate:Bit128ModelProjection['candidate'];
 if(system==='postgresql'&&/^17(?:\.|$)/.test(version)||system==='sqlserver'&&version==='2022')candidate={format:'sql',text:renderBit128SqlModel(layout,binding,source,system as 'postgresql'|'sqlserver',residuals)};
 else if(system==='avro'&&version==='1.12.0'||system==='parquet'&&version==='2.11.0'||system==='tablespec'&&version==='1.0')candidate={format:system as 'avro'|'parquet'|'tablespec',text:renderBit128FileModel(layout,system as 'avro'|'parquet'|'tablespec',residuals)};
 else throw new UmfError('BIT128_MODEL_TARGET','Unsupported versioned model target');
 const status=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'projected';
 const result=copyJson({operation:'project-bit128-model',version:'1.0.0',source,binding,lossPolicy,status,nativeRequirements:system==='sqlserver'?[{scope:'connection',statements:[...bit128SqlServerSessionStatements]}]:[],residuals,mappings:layout.records.map(r=>({record:r.identity,table:r.table,fields:r.fields.map(f=>({identity:f.identity,slots:f.slots,paths:f.slots.map(n=>['avro','parquet'].includes(system)&&f.carrier.kind==='words64'?[f.carrier.highColumn+'__pair',n]:[n])}))})),...(status!=='blocked'?{candidate}:{})}) as unknown as Bit128ModelProjection;
 assertBit128OutputBudget(result as unknown as Json);if(!check(result))throw new UmfError('BIT128_MODEL_RESULT',JSON.stringify(check.errors));return result;
}
export function recoverBit128ModelProjection(input:Bit128ModelProjection,current:string):{logical:Document;binding:Document}{
 const report=copyJson(input) as unknown as Bit128ModelProjection,expected=projectBit128Model(report.binding,report.source,report.lossPolicy);
 if(canonicalSchemaJson(report)!==canonicalSchemaJson(expected)||!expected.candidate||current!==expected.candidate.text)throw new UmfError('BIT128_MODEL_STALE','Changed source, report or native artifact');
 return {logical:expected.source,binding:expected.binding};
}

import type {Document} from '../../model/types';

export interface TypeSpecDiagnostic {
  code:string;
  severity:'error'|'warning';
  message:string;
  file?:string;
  start?:number;
  end?:number;
}
export interface TypeSpecCompilerReport {
  compiler:'@typespec/compiler@1.16.0';
  libraries:Record<string,string>;
  valid:boolean;
  complete:false;
  diagnostics:TypeSpecDiagnostic[];
  limitations:string[];
}
export interface TypeSpecGraphReport {
  status:'available'|'blocked';
  source:Document;
  compilation:TypeSpecCompilerReport;
  roots:Array<{expression:string;target:string}>;
  nodes:Array<{
    id:string;
    kind:string;
    label:string;
    attributes:Record<string,unknown>;
    edges:Array<{role:string;target:string;name?:string;index?:number}>;
    location?:{file:string;start:number;end:number};
  }>;
  issues:Array<{code:string;detail:string}>;
  complete:false;
  limitations:string[];
}
export interface TypeSpecJsonSchemaEmission {
  status:'emitted'|'empty'|'blocked';
  source:Document;
  emitter:'@typespec/json-schema@1.16.0';
  policy:{options:Record<string,unknown>};
  compilation:TypeSpecCompilerReport;
  files:Record<string,string>;
  complete:false;
  limitations:string[];
}

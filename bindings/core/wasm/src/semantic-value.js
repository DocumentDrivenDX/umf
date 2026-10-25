// SPDX-License-Identifier: MIT OR Apache-2.0
import {AdmissionError,encodeWire,fromWire,resultError} from './wire.js';

export class SemanticValueError extends Error {
  constructor(code,message,path=''){super(message);this.name='SemanticValueError';this.code=code;this.path=path;}
}
const MAX_CALLBACK_UNITS = 1_000_000;
const MAX_CALLBACK_FRAME_WORK = 1_048_576;
class HostFrameLimitError extends Error {}
export function frameWork() {
  let used=0;
  return amount=>{used+=amount;if(!Number.isSafeInteger(used)||used>MAX_CALLBACK_FRAME_WORK)throw new HostFrameLimitError('Semantic validator response exceeds the host frame limit');};
}

/** Caller-owned synchronous validator registry. Each call reconstructs the Rust registry. */
export function createSemanticTypeRegistry(addon,{getControlBridge=()=>undefined,ErrorType=SemanticValueError}={}) {
  const entries=[];
  const callbacks=new Map();
  let nextToken=1;
  const invoke=(op,fields={},withHostControls=true)=>{
    const callbackMap=new Map(callbacks);
    const dispatcher=(token,requestWire)=>{
      const validator=callbackMap.get(token);
      if(!validator)return encodeWire({status:'threw',message:'Validator token is unavailable',reportedWork:0});
      let reportedWork=0;
      let reportFault;
      const reportWork=units=>{
        if(!Number.isSafeInteger(units)||units<0||!Number.isSafeInteger(reportedWork+units)){
          reportFault={code:'HOST_CONTROL',message:'Invalid semantic validator reported work'};
          throw new Error(reportFault.message);
        }
        reportedWork+=units;
      };
      const resource=(code,message)=>encodeWire({status:'resource',code,message:String(message).slice(0,MAX_CALLBACK_UNITS),reportedWork});
      const callbackFailure=error=>{
        let message='';
        if(error instanceof Error){try{const raw=error.message;if(raw)message=String(raw).slice(0,MAX_CALLBACK_UNITS);}catch{message='';}}
        return encodeWire({status:'threw',message,reportedWork},{maxDepth:128,maxValues:100_000});
      };
      let result;
      try {
        const input=fromWire(JSON.parse(requestWire));
        result=validator(input.value,input.definition,Object.freeze({reportWork}));
      } catch(error) {
        return reportFault?resource(reportFault.code,reportFault.message):callbackFailure(error);
      }
      if(reportFault)return resource(reportFault.code,reportFault.message);
      const responseWork=frameWork();
      try {
        let resultWire;
        resultWire=encodeWire(result,{maxDepth:128,maxValues:100_000,work:responseWork});
        const resultValue=fromWire(JSON.parse(resultWire),responseWork);
        return encodeWire({status:'returned',result:resultValue,reportedWork},{maxDepth:128,maxValues:100_000,work:responseWork});
      } catch(error) {
        if(error instanceof HostFrameLimitError)return resource('RESOURCE_LIMIT',error.message);
        if(error instanceof AdmissionError && error.code==='RESOURCE_LIMIT')return resource(error.code,error.message);
        return encodeWire({status:'threw',message:'Value is not JSON-compatible',reportedWork});
      }
    };
    const request={op,entries,...fields};
    const response=JSON.parse(addon.executeSemanticValueWire(encodeWire(request,{maxDepth:128,maxValues:1_000_000}),dispatcher,withHostControls?getControlBridge():undefined));
    const failure=resultError(response);
    if(failure)throw new ErrorType(failure.code,failure.message,failure.path);
    return fromWire(JSON.parse(response.wire));
  };
  return Object.freeze({
    register(reference,definition,validator){
      const validFunction=validator===undefined||typeof validator==='function';
      const token=validator===undefined||!validFunction?null:nextToken++;
      const copiedReference=fromWire(JSON.parse(encodeWire(reference)));
      invoke('registry/admitReference',{entries:[],reference:copiedReference},false);
      const candidate={reference:copiedReference,definition:fromWire(JSON.parse(encodeWire(definition))),validatorPresent:validator!==undefined,validatorIsFunction:validFunction,validatorToken:token};
      invoke('registry/admit',{entries:[...entries,candidate]});
      entries.push(candidate);
      if(token!==null)callbacks.set(token,validator);
      return this;
    },
    lookup(reference){const result=invoke('registry/lookup',{entries,reference});return result===null?undefined:result;},
    check(reference,value){
      const copiedReference=fromWire(JSON.parse(encodeWire(reference)));
      const projection=entries.map(entry=>({reference:entry.reference,validatorPresent:entry.validatorToken!==null}));
      const prepared=invoke('registry/prepareCheck',{entries:projection,reference:copiedReference},false);
      if(prepared!==true)return prepared;
      return invoke('registry/check',{entries,reference:copiedReference,value});
    },
    validateCoreSemanticTypeValue(resources,source,identity,value){
      invoke('model/prepareCoreSemanticTypeValue',{entries:[],resources,source,identity},false);
      return invoke('model/validateCoreSemanticTypeValue',{entries,resources,source,identity,value});
    },
  });
}

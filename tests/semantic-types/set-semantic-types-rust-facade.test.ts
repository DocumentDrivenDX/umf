import {expect, test} from 'bun:test';
import {UmfError} from '../../src/model/errors';
import {bindSemanticTypeAccessorsRust} from '../../src/model/rust-semantic-type-accessors-default';

test('setSemanticTypes delegates annotation unchanged and returns the core copy-on-write result',()=>{
 const source={id:'doc',extensions:{native:{value:1}}};
 const annotation={types:[{vocabulary:'example.contact',version:'1.0',term:'email',custom:'retained'}]};
 const target={...source,extensions:{...source.extensions,semanticTypes:annotation}};
 let args:unknown[]=[];
 const api=bindSemanticTypeAccessorsRust({
  getSemanticTypes(){return annotation;},
  setSemanticTypes(...input){args=input;return target;},
 });
 const result=api.setSemanticTypes(source as never,'contact','Email',annotation as never);
 expect(args).toEqual([source,'contact','Email',annotation]);
 expect(result).toBe(target);
 expect(source).toEqual({id:'doc',extensions:{native:{value:1}}});
});

test('setSemanticTypes preserves unrelated host errors',()=>{
 const hostError=new TypeError('host failure');
 const api=bindSemanticTypeAccessorsRust({getSemanticTypes(){return {};},setSemanticTypes(){throw hostError;}},()=>false);
 expect(()=>api.setSemanticTypes({} as never,'m','e',{} as never)).toThrow(hostError);
 expect(hostError).not.toBeInstanceOf(UmfError);
});

test('setSemanticTypes preserves cooperative resource failures from the host boundary',()=>{
 const resourceFailure=Object.assign(new Error('control budget exhausted'),{code:'RESOURCE_LIMIT'});
 const api=bindSemanticTypeAccessorsRust({getSemanticTypes(){return {};},setSemanticTypes(){throw resourceFailure;}},error=>error===resourceFailure);
 try{api.setSemanticTypes({} as never,'m','e',{} as never);throw new Error('expected failure');}
 catch(error){expect(error).toBe(resourceFailure);}
});

test('setSemanticTypes preserves native structural TypeErrors from the host boundary',()=>{
 const typeError=Object.assign(new TypeError('candidate.modules.find is not a function'),{code:'TYPE_ERROR'});
 const api=bindSemanticTypeAccessorsRust({getSemanticTypes(){return {};},setSemanticTypes(){throw typeError;}},error=>error===typeError);
 try{api.setSemanticTypes({} as never,'m','e',{} as never);throw new Error('expected failure');}
 catch(error){expect(error).toBe(typeError);expect(error).toBeInstanceOf(TypeError);}
});

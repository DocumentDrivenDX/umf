import {expect, test} from 'bun:test';
import {UmfError} from '../../src/model/errors';
import {bindSemanticTypeAccessorsRust} from '../../src/model/rust-semantic-type-accessors-default';

test('getSemanticTypes delegates exact identity to Rust and preserves the returned snapshot',()=>{
 const annotation={types:[{vocabulary:'example.contact',version:'1.0',term:'email',source:'kept'}]};
 let args:unknown[]=[];
 const api=bindSemanticTypeAccessorsRust({
  getSemanticTypes(...input){args=input;return annotation;},
  setSemanticTypes(){throw new Error('unused');},
 });
 const result=api.getSemanticTypes({id:'doc'} as never,'contact','Email');
 expect(args).toEqual([{id:'doc'},'contact','Email']);
 expect(result).toBe(annotation);
});

test('getSemanticTypes translates only recognized host JSON response errors to public UmfError',()=>{
 const native=Object.assign(new Error('missing annotation'),{code:'SEMANTIC_TYPE_PROFILE',path:'/modules/0'});
 const api=bindSemanticTypeAccessorsRust({getSemanticTypes(){throw native;},setSemanticTypes(){return {}; }},error=>error===native);
 try{api.getSemanticTypes({} as never,'m','e');throw new Error('expected failure');}
 catch(error){expect(error).toBeInstanceOf(UmfError);expect(error).toMatchObject({code:'SEMANTIC_TYPE_PROFILE',path:'/modules/0'});}
});

test('getSemanticTypes preserves cooperative resource failures from the host boundary',()=>{
 const resourceFailure=Object.assign(new Error('control budget exhausted'),{code:'RESOURCE_LIMIT'});
 const api=bindSemanticTypeAccessorsRust({getSemanticTypes(){throw resourceFailure;},setSemanticTypes(){return {}; }},error=>error===resourceFailure);
 try{api.getSemanticTypes({} as never,'m','e');throw new Error('expected failure');}
 catch(error){expect(error).toBe(resourceFailure);}
});

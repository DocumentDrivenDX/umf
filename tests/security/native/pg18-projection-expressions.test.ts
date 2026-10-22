import {test,expect} from 'bun:test';
import {compilePg18ProtectionExpression as compile} from '../../../tools/security/protection-pg18-expressions';
const base=()=>({profile:'umf.security.pg18-expression/0.1',source:{alias:'r',column:'value'},family:'string',recipe:{operation:'prefix-only',unit:'unicode-scalar',length:2}});
test('closed expression input and provider refuse unsupported SQL/semantics atomically',()=>{
 const bad:unknown[]=[null,{}, {...base(),extra:true},{...base(),profile:'latest'},{...base(),source:{alias:'r;DROP',column:'value'}},{...base(),source:{alias:'r',column:'value',sql:'secret'}},{...base(),family:'float'}];
 for(const recipe of [
 {operation:'prefix-only',unit:'utf16',length:2}, {operation:'prefix-only',unit:'unicode-scalar',length:-1},
 {operation:'prefix-only',unit:'unicode-scalar',length:4097},{operation:'prefix-only',unit:'unicode-scalar',length:.1},
 {operation:'partial',unit:'unicode-scalar',prefix:1,suffix:1,padding:'ab'},
 {operation:'partial',unit:'unicode-scalar',prefix:1,suffix:1,padding:'\ud800'},
 {operation:'constant',value:'\0'},{operation:'constant',value:'\udfff'},
 ...['a.*','(?=a)','a|b','a\\1','[a-z]','^a',''].map(pattern=>({operation:'regex-replace',provider:'umf.security.pg18-literal-regex/0.1',pattern,replacement:'x'})),
 {operation:'regex-replace',provider:'ECMAScript',pattern:'a',replacement:'x'},
 {operation:'hash',algorithm:'sha256-utf8-lowerhex',salt:'none',retainedEquality:false,dictionaryWarning:'unsalted-dictionary-attack'},
 {operation:'hash',algorithm:'sha256-utf8-lowerhex',salt:'none',retainedEquality:true,dictionaryWarning:'none'},
 {operation:'hash',algorithm:'sha1',salt:'none',retainedEquality:true,dictionaryWarning:'unsalted-dictionary-attack'},
 {operation:'native',sql:'evil()'},
 ])bad.push({...base(),recipe});
 for(const recipe of [{operation:'range-bucket',width:'0',origin:'0'},{operation:'range-bucket',width:'-1',origin:'0'},{operation:'range-bucket',width:'1e3',origin:'0'},{operation:'range-bucket',width:'1.1',origin:'0'}])bad.push({...base(),family:'integer',recipe});
 for(const request of bad){const result=compile(request);expect(result.status).toBe('refused');expect(result.sql).toBeNull();expect(result.complete).toBe(false);expect(result.authority).toBe(false);}
});
test('quotes, slash and supplementary scalars remain SQL literals; no native permit',()=>{
 const result=compile({...base(),recipe:{operation:'constant',value:"😀'\\; SELECT secret"}});
 expect(result.status).toBe('compiled');expect(result.sql).toBe("E'😀''\\\\; SELECT secret'");expect(result.complete).toBe(false);expect(result.authority).toBe(false);expect(Object.isFrozen(result)).toBe(true);
});

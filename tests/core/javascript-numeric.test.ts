import {test,expect} from 'bun:test';
import {admitJavascriptNumber,exactDecimal,integerFromBigInt,integerToBigInt,numericToNumberLossless,writeDocument,readDocument,type Document} from '../../src/index';
const context=()=>({document:{umf:'0.8.0',id:'numeric',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'n',kind:'field',scalarType:'integer',facets:{integerWidth:{bits:64,signed:true},range:{min:{integerToken:'0'},max:{integerToken:'9223372036854775807'}}},extensions:{}}]}]} as Document,field:{module:'m',element:'n'}});
// @covers US-054-AC1
// @covers US-054-AC2
// @covers US-054-AC5
// @covers US-054-AC6
test('safe integer admission and bigint boundaries',()=>{
 for(const n of [0,1,-1,Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER])expect(numericToNumberLossless(admitJavascriptNumber(n,'integer'))).toBe(n);
 for(const n of [-0,NaN,Infinity,-Infinity,0.5,2**53])expect(()=>admitJavascriptNumber(n,'integer')).toThrow();
 const c=context(),n=9223372036854775807n;
 expect(integerToBigInt(integerFromBigInt(n,c),c)).toBe(n);
 for(const n of [-1n,9223372036854775808n])expect(()=>integerFromBigInt(n,c)).toThrow();
 expect(()=>integerToBigInt({integerToken:'9223372036854775808'},c)).toThrow();
 expect(()=>numericToNumberLossless(integerFromBigInt(2n**53n))).toThrow();
 expect(integerToBigInt({integerToken:'12300e-2'})).toBe(123n);
 for(const token of ['1.1','1e-1','-0','01','1\n'])expect(()=>integerToBigInt({integerToken:token})).toThrow();
});
// @covers US-054-AC3
// @covers US-054-AC4
// @covers US-054-AC5
test('decimal admission uses exact binary value rather than shortest spelling',()=>{
 for(const n of [0,0.5,-0.125,1.25,2**53])expect(numericToNumberLossless(admitJavascriptNumber(n,'decimal'))).toBe(n);
 for(const n of [0.1,0.2,0.3,1.0000000000000002,Number.MIN_VALUE,Number.MAX_VALUE,-0,NaN,Infinity])expect(()=>admitJavascriptNumber(n,'decimal')).toThrow();
 const exact='0.1000000000000000055511151231257827021181583404541015625';
 expect(numericToNumberLossless(exactDecimal(exact))).toBe(0.1);
 expect(numericToNumberLossless(exactDecimal('1.2500E+0'))).toBe(1.25);
 for(const token of ['0.1','1e400','1e-400','-0','-0.000','9007199254740993'])expect(()=>numericToNumberLossless(exactDecimal(token))).toThrow();
 const subnormal=5n**1074n+'e-1074';expect(numericToNumberLossless(exactDecimal(subnormal))).toBe(Number.MIN_VALUE);
});
// @covers US-054-AC3
// @covers US-054-AC8
test('constructor retains spelling and refuses malformed and over-limit input',()=>{
 for(const token of ['-0.00','1.2300E+02','1e99999999999999999999999999999999'])expect(exactDecimal(token)).toEqual({decimalToken:token});
 for(const token of ['NaN','Infinity','+1','01','.1','1.',' 1','1\n','1e'+'9'.repeat(33)])expect(()=>exactDecimal(token)).toThrow();
 expect(()=>exactDecimal('1'.repeat(4_000_001))).toThrow();
 let called=false;expect(()=>numericToNumberLossless({get decimalToken(){called=true;return '1';}})).toThrow();expect(called).toBe(false);
 expect(()=>exactDecimal('1',{get document(){called=true;return context().document;},field:{module:'m',element:'n'}})).toThrow();expect(called).toBe(false);
 expect(()=>numericToNumberLossless({decimalToken:'1',future:'retain'} as any)).toThrow();
 expect(()=>integerFromBigInt(1 as any)).toThrow();expect(()=>admitJavascriptNumber(1,'float' as any)).toThrow();
});
// @covers US-054-AC6
// @covers US-054-AC7
test('declared decimals, exclusions, unknown qualifiers and JSON/YAML carriers',()=>{
 const c=context(),field=c.document.modules[0]!.elements[0]!;
 field.scalarType='decimal';field.facets={precision:4,scale:2,range:{min:{decimalToken:'0'},max:{decimalToken:'10'},maxInclusive:false}};
 expect(exactDecimal('1.2500',c)).toEqual({decimalToken:'1.2500'});
 for(const token of ['10','-0.01','1.251','100'])expect(()=>exactDecimal(token,c)).toThrow();
 field.allowedValues=[{decimalToken:'1.25'}];expect(()=>admitJavascriptNumber(0.5,'decimal',c)).toThrow();
 expect(numericToNumberLossless(exactDecimal('1.25'),c)).toBe(1.25);
 const before=JSON.stringify(c.document),literal=exactDecimal('1.2500',c);expect(JSON.stringify(c.document)).toBe(before);field.examples=[literal];
 for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(c.document,format),format)).toEqual(c.document);
 (field.facets as any).future='unknown';expect(()=>exactDecimal('1.25',c)).toThrow();
 c.document.umf='0.7.0';expect(()=>exactDecimal('1.25',c)).toThrow();
});

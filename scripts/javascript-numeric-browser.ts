import {chromium} from 'playwright';
// @covers US-054-AC7
// @covers US-054-AC9
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
 return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>UMF numeric verification</title>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
try {
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path);let checks=0;
  const check=(v:boolean)=>{checks++;if(!v)throw new Error('Numeric browser check '+checks);};
  const refuses=(fn:()=>unknown)=>{let refused=false;try{fn();}catch{refused=true;}check(refused);};
  for(const value of [0,1,-1,Number.MAX_SAFE_INTEGER])check(u.numericToNumberLossless(u.admitJavascriptNumber(value,'integer'))===value);
  for(const value of [0.1,0.3,Number.MIN_VALUE,Number.MAX_VALUE,-0,Infinity,NaN])refuses(()=>u.admitJavascriptNumber(value,'decimal'));
  check(u.numericToNumberLossless(u.exactDecimal('0.1000000000000000055511151231257827021181583404541015625'))===0.1);
  check(u.numericToNumberLossless(u.exactDecimal(5n**1074n+'e-1074'))===Number.MIN_VALUE);
  check(u.integerToBigInt(u.integerFromBigInt(9223372036854775807n))===9223372036854775807n);
  refuses(()=>u.numericToNumberLossless(u.exactDecimal('0.1')));
  refuses(()=>u.numericToNumberLossless(u.integerFromBigInt(9007199254740993n)));
  const document={umf:'0.8.0',id:'numeric-browser',vocabularies:{},future:{preserved:'yes'},modules:[{id:'m',namespace:'',elements:[{id:'n',kind:'field',scalarType:'integer',examples:[] as {integerToken:string}[],facets:{integerWidth:{bits:64,signed:true}},extensions:{}}]}]};
  const context={document,field:{module:'m',element:'n'}};
  document.modules[0]!.elements[0]!.examples=[u.integerFromBigInt(9223372036854775807n,context)];
  refuses(()=>u.integerFromBigInt(9223372036854775808n,context));
  for(const format of ['json','yaml']){const copy=u.readDocument(u.writeDocument(document,format),format);check(u.integerToBigInt(copy.modules[0].elements[0].examples[0],{...context,document:copy})===9223372036854775807n);check(copy.future.preserved==='yes');}
  const decimalDocument={umf:'0.8.0',id:'decimal-browser',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'n',kind:'field',scalarType:'decimal',facets:{precision:4,scale:2,range:{max:{decimalToken:'10'},maxInclusive:false}},extensions:{}}]}]};
  const decimalContext={document:decimalDocument,field:{module:'m',element:'n'}};
  check(u.exactDecimal('1.2500',decimalContext).decimalToken==='1.2500');
  check(u.numericToNumberLossless(u.admitJavascriptNumber(0.5,'decimal',decimalContext),decimalContext)===0.5);
  refuses(()=>u.exactDecimal('10',decimalContext));refuses(()=>u.exactDecimal('1.251',decimalContext));
  check(typeof (globalThis as any).Bun==='undefined' && typeof (globalThis as any).process==='undefined');
  return {checks};
 });
 console.log(JSON.stringify({browser:browser.version(),...result}));
}finally {await browser.close();server.stop(true);}

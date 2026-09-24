import {RdfXmlParser} from 'rdfxml-streaming-parser';

const XML='http://www.w3.org/XML/1998/namespace',XMLNS='http://www.w3.org/2000/xmlns/';
const text=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\r','&#13;');
const attribute=(s:string)=>text(s).replaceAll('"','&quot;').replaceAll('\t','&#9;').replaceAll('\n','&#10;');

/** Pinned experimental correction; not a public adapter or canonical XML serializer. */
export class LiteralParser extends RdfXmlParser {
 protected attachSaxListeners():void {
  super.attachSaxListeners();const sax=(this as any).saxParser;
  sax.on('comment',(value:string)=>{const top=(this as any).activeTagStack.at(-1);if(top?.childrenStringTags)top.childrenStringTags.push('<!--'+value+'-->');});
  sax.on('processinginstruction',(pi:any)=>{const top=(this as any).activeTagStack.at(-1);if(top?.childrenStringTags)top.childrenStringTags.push('<?'+pi.target+(pi.body?' '+pi.body:'')+'?>');});
 }
 protected onTag(tag:any):void {
  const stack=(this as any).activeTagStack,parent=stack.at(-1);
  if(!parent?.childrenStringTags){super.onTag(tag);return;}
  // Serialize explicit bindings and bindings needed by element/attribute names.
  // Keep scope per emitted element so sibling rebinding cannot leak.
  const scope:Record<string,string>={...(parent.literalScope??{xml:XML,'':''})},declared=new Map<string,string>();
  const attrs=Object.values(tag.attributes) as any[];
  for(const a of attrs)if(a.uri===XMLNS){const prefix=a.name==='xmlns'?'':a.local;declared.set(prefix,a.value);scope[prefix]=a.value;}
  const requireBinding=(prefix:string,uri:string)=>{if(prefix==='xml')return;if(scope[prefix]!==uri){declared.set(prefix,uri);scope[prefix]=uri;}};
  requireBinding(tag.prefix,tag.uri);
  for(const a of attrs)if(a.prefix&&a.uri!==XMLNS)requireBinding(a.prefix,a.uri);
  let rendered='<'+tag.name;
  for(const [prefix,uri] of declared)rendered+=' '+(prefix?'xmlns:'+prefix:'xmlns')+'="'+attribute(uri)+'"';
  for(const a of attrs)if(a.uri!==XMLNS)rendered+=' '+a.name+'="'+attribute(a.value)+'"';
  rendered+='>';parent.childrenStringTags.push(rendered);
  stack.push({childrenStringTags:parent.childrenStringTags,childrenStringEmitClosingTag:'</'+tag.name+'>',literalScope:scope});
 }
 protected onText(value:string):void {
  const top=(this as any).activeTagStack.at(-1);
  if(top?.childrenStringTags)top.childrenStringTags.push(text(value));
  else if(top?.predicate)top.text=(top.text??'')+value;
  else super.onText(value);
 }
 _flush(callback:(error?:Error|null)=>void){try{(this as any).saxParser.close();callback();}catch(error){callback(error as Error);}}
}

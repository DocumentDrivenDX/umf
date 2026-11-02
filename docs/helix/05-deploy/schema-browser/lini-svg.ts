// SPDX-License-Identifier: MIT OR Apache-2.0
/** Attach native SVG without relaxing style-src 'self'. Native geometry stays
 * untouched; generated styles enter through the CSSOM, never executable markup. */
export function attachLiniSvg(container:HTMLElement,text:string){
 const doc=container.ownerDocument,win=doc.defaultView!;
 const externalCss=(css:string)=>/@import/i.test(css)||[...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some(match=>!match[2]!.trim().startsWith('#'));
 const rules:string[]=[];
 // DOMParser itself can report inline-style CSP violations in its detached
 // document. Extract trusted native styles before XML parsing, then validate
 // every resulting element/attribute before attaching anything to the page.
 const inert=text.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi,(_match,css:string)=>{
  if(externalCss(css))throw Error('Lini returned an external stylesheet reference');
  rules.push(css.replace(/:root\s*,\s*/g,''));return '';
 }).replace(/<[^>]+>/g,tag=>tag.replace(/\sstyle=(['"])([\s\S]*?)\1/gi,' data-umf-native-style=$1$2$1'));
 const parsed=new win.DOMParser().parseFromString(inert,'image/svg+xml');
 const root=parsed.documentElement;
 if(parsed.querySelector('parsererror')||root.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('Lini returned invalid SVG');
 if(root.querySelector('script,foreignObject,iframe,object,embed,animate,set'))throw Error('Lini returned active SVG content');
 for(const element of [root,...root.querySelectorAll('*')])for(const attr of [...element.attributes]){
  if(/^on/i.test(attr.name)||(/(?:^|:)href$/i.test(attr.name)&&!attr.value.startsWith('#')))throw Error('Lini returned an active or external SVG attribute');
 }
 const svg=doc.importNode(root,true) as unknown as SVGSVGElement;
 const scope='umf-lini-'+win.crypto.randomUUID();svg.id=scope;
 const ids=new Map<string,string>();
 for(const element of svg.querySelectorAll('[id]')){const id=element.id;if(ids.has(id))throw Error('Lini returned duplicate SVG identity');ids.set(id,scope+'-'+id);element.id=ids.get(id)!;}
 const reference=(id:string)=>{const mapped=ids.get(id);if(!mapped)throw Error('Lini returned an unresolved SVG fragment');return mapped;};
 const urls=(value:string)=>value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,(_match,quote:string,id:string)=>`url(${quote}#${reference(id)}${quote})`);
 for(let i=0;i<rules.length;i++)rules[i]=urls(rules[i]!);
 for(const element of [svg,...svg.querySelectorAll('*')])for(const attr of [...element.attributes]){
  if(attr.localName==='href'&&attr.value.startsWith('#'))element.setAttribute(attr.name,'#'+reference(attr.value.slice(1)));
  else if(attr.name==='aria-labelledby'||attr.name==='aria-describedby')element.setAttribute(attr.name,attr.value.split(/\s+/).map(reference).join(' '));
  else if(attr.value.includes('url('))element.setAttribute(attr.name,urls(attr.value));
 }
 for(const style of svg.querySelectorAll('style')){
  const css=style.textContent??'';
  if(externalCss(css))throw Error('Lini returned an external stylesheet reference');
  // Lini includes :root alongside its scoped variable selector. The latter
  // already supplies the same variables without changing the host document.
  rules.push(css.replace(/:root\s*,\s*/g,''));style.remove();
 }
 let index=0;
 for(const element of [svg,...svg.querySelectorAll<SVGElement>('[data-umf-native-style]')]){
  const style=element.getAttribute('data-umf-native-style');if(!style)continue;
  if(externalCss(style))throw Error('Lini returned an external style reference');
  const cls='umf-native-'+(++index);element.classList.add(cls);
  rules.push(`#${scope} .${cls},#${scope}.${cls}{${style}}`);element.removeAttribute('data-umf-native-style');
 }
 const sheet=new win.CSSStyleSheet();sheet.replaceSync(rules.join('\n'));
 doc.adoptedStyleSheets=[...doc.adoptedStyleSheets,sheet];
 container.append(svg);
 return {svg,destroy(){svg.remove();doc.adoptedStyleSheets=doc.adoptedStyleSheets.filter(item=>item!==sheet);}};
}

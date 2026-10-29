// SPDX-License-Identifier: MIT OR Apache-2.0
type Definition = {id:string;name?:string;description?:string;kind:string};

/** Local definition navigation. The input retains focus while an option is active. */
export function definitionFinder(items:Definition[],href:(id:string)=>string,onKeyboardNavigate:()=>void){
 const root=document.createElement('div');root.className='definition-finder';
 const label=document.createElement('label');label.textContent='Find a definition';
 const input=document.createElement('input');input.type='search';input.placeholder='Record, Field, Key…';input.autocomplete='off';
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','definition-suggestions');
 const popup=document.createElement('div');popup.className='definition-suggestions';popup.hidden=true;
 const list=document.createElement('div');list.id='definition-suggestions';list.setAttribute('role','listbox');list.setAttribute('aria-label','Matching definitions');
 const status=document.createElement('p');status.setAttribute('role','status');
 label.append(input);popup.append(list,status);root.append(label,popup);
 let options:HTMLAnchorElement[]=[],active=-1;
 const close=()=>{popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;options.forEach(a=>a.setAttribute('aria-selected','false'));};
 const activate=(index:number)=>{
  active=index;options.forEach((a,i)=>a.setAttribute('aria-selected',String(i===active)));
  const option=options[active];if(option){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
 };
 const refresh=()=>{
  const query=input.value.trim().toLocaleLowerCase();close();list.replaceChildren();options=[];
  if(!query){status.textContent='';return;}
  const score=(item:Definition)=>{const name=(item.name??item.id).toLocaleLowerCase(),id=item.id.toLocaleLowerCase();return name===query||id===query?0:name.startsWith(query)||id.startsWith(query)?1:2;};
  const matches=items.filter(item=>`${item.name??''} ${item.id} ${item.description??''}`.toLocaleLowerCase().includes(query)).sort((a,b)=>score(a)-score(b));
  for(const item of matches){
   const option=document.createElement('a');option.href=href(item.id);option.id='definition-option-'+options.length;option.tabIndex=-1;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
   const name=document.createElement('span');name.textContent=item.name??item.id;
   const context=document.createElement('small');context.textContent=(item.kind==='record'?'Record':'Field')+' · '+item.id;
   option.append(name,context);option.onpointerdown=event=>{if(event.button===0)event.preventDefault();};option.onclick=close;
   options.push(option);list.append(option);
  }
  status.textContent=matches.length?`${matches.length} matching definitions. Use Up and Down arrows, then Enter to open.`:'No matching definitions.';
  status.className=matches.length?'visually-hidden':'';popup.hidden=false;input.setAttribute('aria-expanded','true');
 };
 input.oninput=refresh;input.onfocus=refresh;input.onclick=()=>{if(popup.hidden)refresh();};
 input.onblur=close;
 input.onkeydown=event=>{
  if(event.isComposing)return;
  if(event.key==='Escape'){if(!popup.hidden){event.preventDefault();event.stopPropagation();close();}return;}
  if(event.key==='Tab'){close();return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();if(popup.hidden)refresh();if(!options.length)return;
   activate(active<0?(event.key==='ArrowDown'?0:options.length-1):(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length);
  }else if(event.key==='Enter'&&!popup.hidden&&options.length){event.preventDefault();options[active<0?0:active]!.click();onKeyboardNavigate();}
 };
 return root;
}

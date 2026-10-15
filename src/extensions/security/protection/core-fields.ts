/** Private index over an already validated immutable closure, not a resolver credential. */
import type {Document,Element} from '../../../model/types';
import type {SecurityRef} from '../types';
export interface ProtectionFieldLocation {doc:Document;field:Element;documentIndex:number;moduleIndex:number;elementIndex:number}
export class ProtectionFieldIndex {
 private readonly documents=new Map<string,Map<string,Map<string,ProtectionFieldLocation>>>();
 constructor(closure:{documents:{document:Document}[]}){
  for(const [documentIndex,entry] of closure.documents.entries()){
   const modules=new Map<string,Map<string,ProtectionFieldLocation>>();this.documents.set(entry.document.id,modules);
   for(const [moduleIndex,module] of entry.document.modules.entries()){
    const fields=new Map<string,ProtectionFieldLocation>();modules.set(module.id,fields);
    for(const [elementIndex,field] of module.elements.entries())if(field.kind==='field')fields.set(field.id,{doc:entry.document,field,documentIndex,moduleIndex,elementIndex});
   }
  }
 }
 get(ref:SecurityRef):ProtectionFieldLocation|undefined{return this.documents.get(ref.documentId)?.get(ref.moduleId)?.get(ref.elementId);}
}

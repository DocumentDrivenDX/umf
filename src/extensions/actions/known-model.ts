import {validateDocument} from '../../validation/document';
import {UmfError,type Document,type Element} from '../../model/types';
import type {ActionReference,ActionRelationshipReference} from './types';
/** Strict consumer admission is scoped to actual model dependencies, including their closure. */
export function knownActionModel(document:Document,reference:ActionReference,kind?:string):Element {
 const warnings=validateDocument(document).diagnostics.filter(d=>d.severity==='warning'),visited=new Set<string>();
 const visit=(ref:ActionReference,expected?:string):Element=>{
  const mi=document.modules.findIndex(m=>m.id===ref.module),ei=document.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1,node=document.modules[mi]?.elements[ei];
  if(!node||expected&&node.kind!==expected)throw new UmfError('ACTION_REFERENCE','Exact model dependency does not resolve');
  const path=`/modules/${mi}/elements/${ei}`;if(visited.has(path))return node;visited.add(path);
  if(warnings.some(d=>d.path===path||d.path.startsWith(path+'/'))||Object.keys(node.extensions).length)throw new UmfError('ACTION_UNCHECKED','Referenced model contains uninterpreted meaning',path);
  for(const member of (node.members??[]) as ActionReference[])visit(member);
  for(const key of (node.keys??[]) as {fields:ActionReference[]}[])for(const field of key.fields)visit(field,'field');
  for(const ref of (node.references??[]) as ActionReference[])visit(ref);
  if(node.itemType)visit(node.itemType as ActionReference);
  return node;
 };return visit(reference,kind);
}
export function knownActionRelationship(document:Document,reference:ActionRelationshipReference):any {
 const mi=document.modules.findIndex(m=>m.id===reference.module),relationships=(document.modules[mi]?.relationships??[]) as any[],ri=relationships.findIndex(r=>r.id===reference.relationship),node=relationships[ri];
 if(!node)throw new UmfError('ACTION_REFERENCE','Exact relationship dependency does not resolve');
 const path=`/modules/${mi}/relationships/${ri}`;
 if(validateDocument(document).diagnostics.some(d=>d.severity==='warning'&&(d.path===path||d.path.startsWith(path+'/'))))throw new UmfError('ACTION_UNCHECKED','Referenced relationship contains uninterpreted meaning',path);
 for(const endpoint of [...node.source,...node.target])knownActionModel(document,endpoint,'record');
 if(node.associationRecord)knownActionModel(document,node.associationRecord,'record');
 return node;
}

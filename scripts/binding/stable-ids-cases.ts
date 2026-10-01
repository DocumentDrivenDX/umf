import type {Document} from '../../src';
import {relationshipCandidate} from '../core-relationship-cases';
export function bindingMigrationCase(){
 const logical:Document=relationshipCandidate();
 const binding:Document={umf:'0.1.0',id:'physical',vocabularies:{'umf.binding':{version:'0.1.0',future:{keep:true}}},modules:[],extensions:{'umf.binding':{profile:'umf-binding-1',logical:{documentId:logical.id,coreVersion:logical.umf},target:{system:'postgresql',version:'17',subset:'relationship-choices-only'},elements:[],fields:[],indexes:[],relationships:[{module:'m',name:'customer',storage:'foreign_key',future:{opaque:['retain']}}],future:{unknown:true}}},future:{root:true}};
 return {logical,binding};
}

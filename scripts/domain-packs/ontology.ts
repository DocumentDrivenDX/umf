/** Declared tabular-to-core ontology mapping; no graph execution claim. */
export function ontology(packId:string,specs:any[]){
 const module='domain',elements:any[]=[],relationships:any[]=[];
 for(const table of specs){
  const name=table.table_name,members=table.columns.map((c:any)=>({module,element:name+'.'+c.name}));
  elements.push({id:name,kind:'record',name,title:name,description:table.description,members,keys:[{id:'identity',name:'Identity',fields:(table.primary_key??[]).map((col:string)=>({module,element:name+'.'+col})),primary:true}],extensions:{}});
  for(const c of table.columns){const scalarType=({VARCHAR:'string',TEXT:'string',STRING:'string',INTEGER:'integer',DECIMAL:'decimal',BOOLEAN:'boolean',DATE:'date',TIMESTAMP:'timestamp'} as any)[c.data_type];if(!scalarType)throw Error('Unsupported ontology field: '+c.data_type);
   elements.push({id:name+'.'+c.name,name:c.name,kind:'field',scalarType,cardinality:'one',nullability:c.nullable?'absent-allowed':'required',description:c.description,extensions:{},...(c.data_type==='DECIMAL'?{facets:{precision:c.precision,scale:c.scale}}:{})});
  }
  for(const fk of table.relationships?.foreign_keys??[]){const col=table.columns.find((c:any)=>c.name===fk.column);
   relationships.push({id:name+'.'+fk.column,name:name+'.'+fk.column,source:[{module,element:name}],target:[{module,element:fk.references_table,key:'identity'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:col.nullable?0:1,max:1},targetLifecycle:'independent',directed:true});
  }
 }
 return {umf:'0.8.0',id:'urn:umf:domain:'+packId,title:packId+' ontology',vocabularies:{},modules:[{id:module,namespace:'urn:umf:domain:'+packId+':',elements,relationships}]};
}

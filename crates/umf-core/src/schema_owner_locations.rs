// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private structural coordinates over a completely admitted immutable owner.
//! No addresses, diagnostic strings or external identifiers are stored here.
use super::*;
#[derive(Clone, Debug)]
pub(super) struct OwnerCursor {
    lineage: Arc<()>,
    node: usize,
}
#[derive(Debug)]
struct Descriptor {
    root: usize,
    parent: Option<usize>,
    edge: usize,
    first: usize,
    count: usize,
    depth: usize,
}
#[derive(Debug, Default)]
pub(super) struct RootFacts {
    pub(super) nodes: usize,
    pub(super) nested_ids: bool,
    pub(super) nested_anchors: bool,
}
#[derive(Debug)]
pub(super) struct OwnerLocations {
    lineage: Arc<()>,
    dialect: SchemaDialect,
    strict: bool,
    policy: KeywordPolicy,
    resolved: bool,
    nodes: Vec<Descriptor>,
    edges: Vec<usize>,
    roots: Vec<usize>,
    pub(super) facts: Vec<RootFacts>,
}
const DESCRIPTOR_WORDS:usize=std::mem::size_of::<Descriptor>().div_ceil(std::mem::size_of::<usize>());
impl OwnerLocations {
    // This traversal replaces the ColdResourceIndex raw-tree absence scan on
    // the selected path. Every new descriptor/edge and capacity is additional
    // admitted work; no old traversal cost is retained as a fictitious debit.
    pub(super) fn build(owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<Arc<Self>>,EngineError> {
        Self::build_observed(owner,ctx,&mut |_|{})
    }
    #[cfg(test)]
    pub(super) fn build_with_events(owner:&CompiledSchema,ctx:&mut Context<'_>,mut event:impl FnMut(&'static str))->Result<Option<Arc<Self>>,EngineError> {
        Self::build_observed(owner,ctx,&mut event)
    }
    fn build_observed(owner:&CompiledSchema,ctx:&mut Context<'_>,event:&mut impl FnMut(&'static str))->Result<Option<Arc<Self>>,EngineError> {
        ctx.with_constructor_site("ctor.index-build",|ctx| {
            let Some(lineage)=&owner.owner_lineage else {return Ok(None);};
            let Some(roots)=owner.resources.entries.len().checked_add(1) else {return Ok(None);};
            if roots>ctx.limits().max_values {return Ok(None);}
            ctx.charge_work(roots.saturating_mul(1+std::mem::size_of::<RootFacts>().div_ceil(std::mem::size_of::<usize>())).saturating_add(std::mem::size_of::<Self>().div_ceil(std::mem::size_of::<usize>())).saturating_add(2),Utf16::default())?;
            event("roots-reserve");
            let mut root_slots=Vec::new();let mut root_facts=Vec::new();
            if root_slots.try_reserve_exact(roots).is_err() || root_facts.try_reserve_exact(roots).is_err(){return Ok(None);}
            let mut table=Self{lineage:Arc::clone(lineage),dialect:owner.dialect,strict:owner.strict,policy:owner.root_keyword_policy,resolved:owner.resolve_references_at_compile,nodes:Vec::new(),edges:Vec::new(),roots:root_slots,facts:root_facts};
            for root in 0..roots {
                let value=if root==0 {&*owner.schema}else {&owner.resources.entries[root-1].1};
                let mut facts=RootFacts::default();
                let Some(node)=table.visit(value,root,None,0,0,&mut facts,ctx,event)? else {return Ok(None);};
                ctx.charge_work(5,Utf16::default())?;
                table.roots.push(node);table.facts.push(facts);
            }
            ctx.charge_work(1,Utf16::default())?;
            event("publish");
            Ok(Some(Arc::new(table)))
        })
    }
    fn visit(&mut self,value:&Value,root:usize,parent:Option<usize>,edge:usize,depth:usize,facts:&mut RootFacts,ctx:&mut Context<'_>,event:&mut impl FnMut(&'static str))->Result<Option<usize>,EngineError> {
        ctx.charge_work(1,Utf16::default())?;
        if self.nodes.len()>=ctx.limits().max_values || depth>ctx.limits().max_depth {return Ok(None);}
        let count=match value {Value::Object(v)=>v.len(),Value::Array(v)=>v.len(),_=>0};
        let Some(end)=self.edges.len().checked_add(count) else {return Ok(None);};
        if end>ctx.limits().max_values {return Ok(None);}
        // Capacity relocation and the actual descriptor field storage are paid
        // before reserve/push. Fallible representation unavailability is an
        // optional-index fallback; a Context refusal propagates immediately.
        if self.nodes.len()==self.nodes.capacity() {
            let wanted=self.nodes.capacity().saturating_mul(2).max(1).min(ctx.limits().max_values);
            ctx.charge_work(self.nodes.len().saturating_add(wanted).saturating_mul(DESCRIPTOR_WORDS),Utf16::default())?;
            event("nodes-reserve");
            if self.nodes.try_reserve_exact(wanted-self.nodes.len()).is_err(){return Ok(None);}
        }
        if end>self.edges.capacity() {
            let wanted=self.edges.capacity().saturating_mul(2).max(end).min(ctx.limits().max_values);
            ctx.charge_work(self.edges.len().saturating_add(wanted),Utf16::default())?;
            event("edges-reserve");
            if self.edges.try_reserve_exact(wanted-self.edges.len()).is_err(){return Ok(None);}
        }
        ctx.charge_work(count.saturating_add(DESCRIPTOR_WORDS),Utf16::default())?;
        let node=self.nodes.len();let first=self.edges.len();
        self.nodes.push(Descriptor{root,parent,edge,first,count,depth});self.edges.resize(end,usize::MAX);facts.nodes=facts.nodes.checked_add(1).expect("bounded descriptor count");
        match value {
            Value::Object(members)=>for (i,(key,child))in members.iter().enumerate(){
                ctx.charge_work(key.len().min(14).saturating_mul(3).saturating_add(1),Utf16::default())?;
                if depth!=0 && matches!(child,Value::String(_)) {
                    if construction_index::ascii_key_for_owner(key,"$id") || construction_index::ascii_key_for_owner(key,"id"){facts.nested_ids=true;}
                    if construction_index::ascii_key_for_owner(key,"$dynamicAnchor"){facts.nested_anchors=true;}
                }
                let Some(id)=self.visit(child,root,Some(node),i,depth+1,facts,ctx,event)?else{return Ok(None);};
                ctx.charge_work(1,Utf16::default())?;self.edges[first+i]=id;
            },
            Value::Array(items)=>for(i,child)in items.iter().enumerate(){
                let Some(id)=self.visit(child,root,Some(node),i,depth+1,facts,ctx,event)?else{return Ok(None);};
                ctx.charge_work(1,Utf16::default())?;self.edges[first+i]=id;
            },_=>{}
        }
        Ok(Some(node))
    }
    fn belongs(&self,owner:&CompiledSchema)->bool {
        owner.owner_lineage.as_ref().is_some_and(|lineage|Arc::ptr_eq(lineage,&self.lineage))
            && owner.dialect==self.dialect && owner.strict==self.strict
            && owner.root_keyword_policy==self.policy && owner.resolve_references_at_compile==self.resolved
            && matches!(owner.regex_profile,RegexProfile::Ecma262Unicode)
    }
    pub(super) fn root(&self,owner:&CompiledSchema,role:usize,ctx:&mut Context<'_>)->Result<Option<OwnerCursor>,EngineError> {
        ctx.with_constructor_site("ctor.location-lookup",|ctx|{
            ctx.charge_work(12,Utf16::default())?;
            if !self.belongs(owner){return Ok(None);}
            Ok(self.roots.get(role).filter(|node|**node<ctx.limits().max_values).map(|node|OwnerCursor{lineage:Arc::clone(&self.lineage),node:*node}))
        })
    }
    pub(super) fn child(&self,owner:&CompiledSchema,cursor:&OwnerCursor,edge:usize,ctx:&mut Context<'_>)->Result<Option<OwnerCursor>,EngineError> {
        ctx.with_constructor_site("ctor.location-lookup",|ctx|{
            ctx.charge_work(20,Utf16::default())?;
            if !self.belongs(owner)||!Arc::ptr_eq(&cursor.lineage,&self.lineage){return Ok(None);}
            let Some(node)=self.nodes.get(cursor.node)else{return Ok(None);};
            if cursor.node>=ctx.limits().max_values || edge>=node.count || node.depth>=ctx.limits().max_depth{return Ok(None);}
            if self.edges[node.first+edge]>=ctx.limits().max_values{return Ok(None);}
            Ok(Some(OwnerCursor{lineage:Arc::clone(&self.lineage),node:self.edges[node.first+edge]}))
        })
    }
    pub(super) fn read<'a>(&self,owner:&'a CompiledSchema,cursor:&OwnerCursor,ctx:&mut Context<'_>)->Result<Option<&'a Value>,EngineError> {
        ctx.with_constructor_site("ctor.location-lookup",|ctx|{
            ctx.charge_work(12,Utf16::default())?;
            if !self.belongs(owner)||!Arc::ptr_eq(&cursor.lineage,&self.lineage){return Ok(None);}
            fn read<'a>(table:&OwnerLocations,owner:&'a CompiledSchema,id:usize,ctx:&mut Context<'_>)->Result<Option<&'a Value>,EngineError>{
                ctx.charge_work(8,Utf16::default())?;
                if id>=ctx.limits().max_values{return Ok(None);}
                let Some(node)=table.nodes.get(id)else{return Ok(None);};
                if node.depth>ctx.limits().max_depth{return Ok(None);}
                let Some(parent)=node.parent else{return Ok(if node.root==0{Some(&*owner.schema)}else{owner.resources.entries.get(node.root-1).map(|(_,v)|v)});};
                let Some(value)=read(table,owner,parent,ctx)?else{return Ok(None);};
                Ok(match value{Value::Object(v)=>v.get(node.edge).map(|(_,v)|v),Value::Array(v)=>v.get(node.edge),_=>None})
            }
            read(self,owner,cursor.node,ctx)
        })
    }
}
impl OwnerCursor {
    pub(super) fn same_location(&self,other:&Self)->bool {
        Arc::ptr_eq(&self.lineage,&other.lineage) && self.node==other.node
    }
    pub(super) fn get<'a>(&self,owner:&'a CompiledSchema,ctx:&mut Context<'_>)->Result<&'a Value,EngineError>{
        let Some(table)=&owner.owner_locations else{return Err(schema_error(&Utf16::default(),"Owner location unavailable"));};
        table.read(owner,self,ctx)?.ok_or_else(||schema_error(&Utf16::default(),"Owner location does not belong to this immutable owner"))
    }
}

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
    root:u32,
    parent:u32,
    edge:u32,
    first:u32,
    count:u32,
    depth:u32,
}
impl Descriptor {
    const NO_PARENT:u32=u32::MAX;
    fn admit(root:usize,parent:Option<usize>,edge:usize,first:usize,count:usize,depth:usize,ctx:&mut Context<'_>)->Result<Option<Self>,EngineError> {
        ctx.charge_work(7,Utf16::default())?;
        Ok(Self::checked(root,parent,edge,first,count,depth))
    }
    fn checked(root:usize,parent:Option<usize>,edge:usize,first:usize,count:usize,depth:usize)->Option<Self> {
        let parent=match parent {None=>Self::NO_PARENT,Some(value)=>{let value=u32::try_from(value).ok()?;if value==Self::NO_PARENT{return None;}value}};
        Some(Self{root:u32::try_from(root).ok()?,parent,edge:u32::try_from(edge).ok()?,first:u32::try_from(first).ok()?,count:u32::try_from(count).ok()?,depth:u32::try_from(depth).ok()?})
    }
}

#[derive(Debug, Default)]
pub(super) struct RootFacts {
    pub(super) nodes: usize,
    pub(super) nested_ids: bool,
    pub(super) nested_anchors: bool,
}
#[derive(Debug)]
struct BoundRole {
    view:admitted_structure::View,
    base:usize,
    end:usize,
    physical_end:usize,
    base_depth:u32,
    max_relative_depth:usize,
}
#[derive(Debug)]
enum CoordinateStorage {
    Materialized{nodes:Vec<Descriptor>,edges:Vec<usize>},
    Views{bank:Arc<admitted_bank::SchemaBank>,roles:Vec<BoundRole>,logical_nodes:usize},
}
#[derive(Clone,Copy,Debug)]
struct Coordinate {root:usize,parent:Option<usize>,edge:usize,count:usize,depth:usize}
#[derive(Debug)]
pub(super) struct OwnerLocations {
    lineage: Arc<()>,
    dialect: SchemaDialect,
    strict: bool,
    policy: KeywordPolicy,
    resolved: bool,
    storage:CoordinateStorage,
    roots: Vec<usize>,
    pub(super) facts: Vec<RootFacts>,
}
const DESCRIPTOR_WORDS:usize=std::mem::size_of::<Descriptor>().div_ceil(std::mem::size_of::<usize>());
impl OwnerLocations {
    // This traversal replaces the ColdResourceIndex raw-tree absence scan on
    // the selected path. Every new descriptor/edge and capacity is additional
    // admitted work; no old traversal cost is retained as a fictitious debit.
    pub(super) fn build(owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<Arc<Self>>,EngineError> {
        if let Some(table)=Self::bind_admitted(owner,ctx)?{return Ok(Some(table));}
        Self::build_observed(owner,ctx,&mut |_|{})
    }
    // Bind completed first-traversal coordinates to distinct compiler root
    // roles. This reads compact records, never walks Value/key/path trees.
    fn bind_admitted(owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<Arc<Self>>,EngineError>{
        Self::bind_admitted_impl(owner,ctx,&mut |_|{})
    }
    #[cfg(test)]
    fn bind_admitted_with_events(owner:&CompiledSchema,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Option<Arc<Self>>,EngineError>{Self::bind_admitted_impl(owner,ctx,observer)}
    fn bind_admitted_impl(owner:&CompiledSchema,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Option<Arc<Self>>,EngineError>{
        ctx.with_constructor_site("ctor.index-build",|ctx|{
            let Some(lineage)=&owner.owner_lineage else{return Ok(None);};
            let Some(bank)=&owner.resource_bank else{return Ok(None);};
            let SchemaRoot::Bank(root_bank,role)=&owner.schema else{return Ok(None);};
            ctx.charge_work(7,Utf16::default())?;
            if ctx.profile()!=crate::context::ResourceProfile::Cooperative || !Arc::ptr_eq(bank,root_bank) || !matches!(owner.regex_profile,RegexProfile::Ecma262Unicode)
                || !((owner.strict&&owner.resolve_references_at_compile&&owner.root_keyword_policy==KeywordPolicy::DRAFT2020)
                    || (!owner.strict&&!owner.resolve_references_at_compile&&matches!(role,admitted_bank::BankRoot::Meta))){return Ok(None);}
            let Some(root_count)=bank.len().checked_add(1)else{return Ok(None);};
            if root_count>ctx.limits().max_values{return Ok(None);}
            // Only ordered role headers/roots/facts are reserved. No second
            // node/descriptor/edge vectors are allocated or populated here.
            ctx.charge_work(root_count.saturating_mul(std::mem::size_of::<BoundRole>().div_ceil(std::mem::size_of::<usize>())
                .saturating_add(1).saturating_add(std::mem::size_of::<RootFacts>().div_ceil(std::mem::size_of::<usize>())))
                .saturating_add(std::mem::size_of::<Self>().div_ceil(std::mem::size_of::<usize>())).saturating_add(3),Utf16::default())?;
            observer("binding-role-reserve");
            let mut roles=Vec::new();let mut roots=Vec::new();let mut facts=Vec::new();
            if roles.try_reserve_exact(root_count).is_err()||roots.try_reserve_exact(root_count).is_err()||facts.try_reserve_exact(root_count).is_err(){return Ok(None);}
            let mut total=0usize;
            for logical_role in 0..root_count {
                let view=if logical_role==0{bank.structure_role(*role,ctx)?}else{bank.structure_catalogue(logical_role-1,ctx)?};
                let Some(view)=view else{return Ok(None);};
                ctx.charge_work(14,Utf16::default())?;
                observer("binding-role-map");
                let Some(top)=view.structure.node(view.root)else{return Ok(None);};
                let end=top.end as usize;
                let Some(count)=end.checked_sub(view.root).filter(|n|*n>0)else{return Ok(None);};
                let Some(max_depth)=top.max_depth.checked_sub(top.depth)else{return Ok(None);};
                if end>view.structure.extent()||end>u32::MAX as usize||max_depth as usize>ctx.limits().max_depth
                    ||top.count as usize>=count|| (top.count>0 && top.first as usize!=view.root+1){return Ok(None);}
                let Some(next)=total.checked_add(count)else{return Ok(None);};
                // Distinct logical roles deliberately count duplicated physical
                // subtrees again, exactly as the original materialized table.
                if next>ctx.limits().max_values||next>=u32::MAX as usize{return Ok(None);}
                let root_facts=RootFacts{nodes:count,nested_ids:top.flags&4!=0,nested_anchors:top.flags&8!=0};
                let base_depth=top.depth;
                ctx.charge_work(std::mem::size_of::<BoundRole>().div_ceil(std::mem::size_of::<usize>())
                    .saturating_add(1).saturating_add(std::mem::size_of::<RootFacts>().div_ceil(std::mem::size_of::<usize>())),Utf16::default())?;
                observer("binding-role-store");
                roots.push(total);facts.push(root_facts);
                roles.push(BoundRole{view,base:total,end:next,physical_end:end,base_depth,max_relative_depth:max_depth as usize});
                total=next;
            }
            ctx.charge_work(1,Utf16::default())?;
            observer("binding-publication");
            Ok(Some(Arc::new(Self{lineage:Arc::clone(lineage),dialect:owner.dialect,strict:owner.strict,policy:owner.root_keyword_policy,resolved:owner.resolve_references_at_compile,
                storage:CoordinateStorage::Views{bank:Arc::clone(bank),roles,logical_nodes:total},roots,facts})))
        })
    }
    #[cfg(test)]
    pub(super) fn build_with_events(owner:&CompiledSchema,ctx:&mut Context<'_>,mut event:impl FnMut(&'static str))->Result<Option<Arc<Self>>,EngineError> {
        Self::build_observed(owner,ctx,&mut event)
    }
    fn build_observed(owner:&CompiledSchema,ctx:&mut Context<'_>,event:&mut impl FnMut(&'static str))->Result<Option<Arc<Self>>,EngineError> {
        ctx.with_constructor_site("ctor.index-build",|ctx| {
            let Some(lineage)=&owner.owner_lineage else {return Ok(None);};
            let Some(roots)=owner.catalogue_entries().len().checked_add(1) else {return Ok(None);};
            if roots>ctx.limits().max_values {return Ok(None);}
            ctx.charge_work(1,Utf16::default())?;
            if roots.saturating_sub(1)>u32::MAX as usize {return Ok(None);}
            ctx.charge_work(roots.saturating_mul(1+std::mem::size_of::<RootFacts>().div_ceil(std::mem::size_of::<usize>())).saturating_add(std::mem::size_of::<Self>().div_ceil(std::mem::size_of::<usize>())).saturating_add(2),Utf16::default())?;
            event("roots-reserve");
            let mut root_slots=Vec::new();let mut root_facts=Vec::new();
            if root_slots.try_reserve_exact(roots).is_err() || root_facts.try_reserve_exact(roots).is_err(){return Ok(None);}
            let mut table=Self{lineage:Arc::clone(lineage),dialect:owner.dialect,strict:owner.strict,policy:owner.root_keyword_policy,resolved:owner.resolve_references_at_compile,storage:CoordinateStorage::Materialized{nodes:Vec::new(),edges:Vec::new()},roots:root_slots,facts:root_facts};
            for root in 0..roots {
                let value=if root==0 {&*owner.schema}else {owner.catalogue_entries().get(root-1).expect("admitted catalogue row").1};
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
        if self.legacy_nodes().len()>=ctx.limits().max_values || self.legacy_nodes().len()>=u32::MAX as usize || depth>ctx.limits().max_depth {return Ok(None);}
        let count=match value {Value::Object(v)=>v.len(),Value::Array(v)=>v.len(),_=>0};
        let Some(end)=self.legacy_edges().len().checked_add(count) else {return Ok(None);};
        if end>ctx.limits().max_values {return Ok(None);}
        let node=self.legacy_nodes().len();let first=self.legacy_edges().len();
        let Some(descriptor)=Descriptor::admit(root,parent,edge,first,count,depth,ctx)?else{return Ok(None);};
        // Capacity relocation and the actual descriptor field storage are paid
        // before reserve/push. Fallible representation unavailability is an
        // optional-index fallback; a Context refusal propagates immediately.
        if self.legacy_nodes().len()==self.legacy_nodes().capacity() {
            let wanted=self.legacy_nodes().capacity().saturating_mul(2).max(1).min(ctx.limits().max_values);
            ctx.charge_work(self.legacy_nodes().len().saturating_add(wanted).saturating_mul(DESCRIPTOR_WORDS),Utf16::default())?;
            event("nodes-reserve");
            let additional=wanted-self.legacy_nodes().len();
            if self.legacy_nodes_mut().try_reserve_exact(additional).is_err(){return Ok(None);}
        }
        if end>self.legacy_edges().capacity() {
            let wanted=self.legacy_edges().capacity().saturating_mul(2).max(end).min(ctx.limits().max_values);
            ctx.charge_work(self.legacy_edges().len().saturating_add(wanted),Utf16::default())?;
            event("edges-reserve");
            let additional=wanted-self.legacy_edges().len();
            if self.legacy_edges_mut().try_reserve_exact(additional).is_err(){return Ok(None);}
        }
        ctx.charge_work(count.saturating_add(DESCRIPTOR_WORDS),Utf16::default())?;
        self.legacy_nodes_mut().push(descriptor);self.legacy_edges_mut().resize(end,usize::MAX);facts.nodes=facts.nodes.checked_add(1).expect("bounded descriptor count");
        match value {
            Value::Object(members)=>for (i,(key,child))in members.iter().enumerate(){
                ctx.charge_work(key.len().min(14).saturating_mul(3).saturating_add(1),Utf16::default())?;
                if depth!=0 && matches!(child,Value::String(_)) {
                    if construction_index::ascii_key_for_owner(key,"$id") || construction_index::ascii_key_for_owner(key,"id"){facts.nested_ids=true;}
                    if construction_index::ascii_key_for_owner(key,"$dynamicAnchor"){facts.nested_anchors=true;}
                }
                let Some(id)=self.visit(child,root,Some(node),i,depth+1,facts,ctx,event)?else{return Ok(None);};
                ctx.charge_work(1,Utf16::default())?;self.legacy_edges_mut()[first+i]=id;
            },
            Value::Array(items)=>for(i,child)in items.iter().enumerate(){
                let Some(id)=self.visit(child,root,Some(node),i,depth+1,facts,ctx,event)?else{return Ok(None);};
                ctx.charge_work(1,Utf16::default())?;self.legacy_edges_mut()[first+i]=id;
            },_=>{}
        }
        Ok(Some(node))
    }
    fn legacy_nodes(&self)->&Vec<Descriptor>{match &self.storage{CoordinateStorage::Materialized{nodes,..}=>nodes,_=>unreachable!("raw visitor owns materialized storage")}}
    fn legacy_edges(&self)->&Vec<usize>{match &self.storage{CoordinateStorage::Materialized{edges,..}=>edges,_=>unreachable!("raw visitor owns materialized storage")}}
    fn legacy_nodes_mut(&mut self)->&mut Vec<Descriptor>{match &mut self.storage{CoordinateStorage::Materialized{nodes,..}=>nodes,_=>unreachable!("raw visitor owns materialized storage")}}
    fn legacy_edges_mut(&mut self)->&mut Vec<usize>{match &mut self.storage{CoordinateStorage::Materialized{edges,..}=>edges,_=>unreachable!("raw visitor owns materialized storage")}}
    fn logical_node_count(&self)->usize{match &self.storage{CoordinateStorage::Materialized{nodes,..}=>nodes.len(),CoordinateStorage::Views{logical_nodes,..}=>*logical_nodes}}
    #[cfg(test)]
    fn materialized_node_count(&self)->Option<usize>{match &self.storage{CoordinateStorage::Materialized{nodes,..}=>Some(nodes.len()),_=>None}}
    #[cfg(test)]
    fn materialized_descriptor(&self,node:usize)->Option<&Descriptor>{match &self.storage{CoordinateStorage::Materialized{nodes,..}=>nodes.get(node),_=>None}}
    #[cfg(test)]
    fn materialized_edge(&self,position:usize)->Option<usize>{match &self.storage{CoordinateStorage::Materialized{edges,..}=>edges.get(position).copied(),_=>None}}
    fn belongs_for_access(&self,owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<bool,EngineError>{
        if !self.belongs(owner){return Ok(false);}
        if let CoordinateStorage::Views{bank,..}=&self.storage{
            ctx.charge_work(2,Utf16::default())?;
            return Ok(owner.resource_bank.as_ref().is_some_and(|current|Arc::ptr_eq(current,bank)));
        }
        Ok(true)
    }
    fn bound_role(&self,id:usize,ctx:&mut Context<'_>)->Result<Option<(usize,&BoundRole,usize)>,EngineError>{
        let CoordinateStorage::Views{roles,logical_nodes,..}=&self.storage else{return Ok(None);};
        ctx.charge_work(1,Utf16::default())?;
        if id>=*logical_nodes{return Ok(None);}
        for(role,bound)in roles.iter().enumerate(){
            ctx.charge_work(2,Utf16::default())?;
            if id>=bound.base&&id<bound.end {
                ctx.charge_work(3,Utf16::default())?;
                let Some(raw)=bound.view.root.checked_add(id-bound.base)else{return Ok(None);};
                if raw>=bound.physical_end{return Ok(None);}
                return Ok(Some((role,bound,raw)));
            }
        }
        Ok(None)
    }
    // Explicit scalar coordinate translation, not a Value/node/edge snapshot.
    // Immutable physical records are read in place; no allocation or DFS here.
    fn coordinate(&self,id:usize,ctx:&mut Context<'_>)->Result<Option<Coordinate>,EngineError>{
        self.coordinate_impl(id,ctx,&mut |_|{})
    }
    #[cfg(test)]
    fn coordinate_with_events(&self,id:usize,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Option<Coordinate>,EngineError>{self.coordinate_impl(id,ctx,observer)}
    fn coordinate_impl(&self,id:usize,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Option<Coordinate>,EngineError>{
        if let CoordinateStorage::Materialized{nodes,..}=&self.storage{
            return Ok(nodes.get(id).map(|d|Coordinate{root:d.root as usize,parent:(d.parent!=Descriptor::NO_PARENT).then_some(d.parent as usize),edge:d.edge as usize,count:d.count as usize,depth:d.depth as usize}));
        }
        let Some((root,bound,raw))=self.bound_role(id,ctx)?else{return Ok(None);};
        ctx.charge_work(12,Utf16::default())?;
        observer("coordinate-record-read");
        let Some(node)=bound.view.structure.node(raw)else{return Ok(None);};
        let Some(depth)=node.depth.checked_sub(bound.base_depth)else{return Ok(None);};
        if depth as usize>bound.max_relative_depth||node.end as usize>bound.physical_end{return Ok(None);}
        let parent=if raw==bound.view.root{None}else{
            let Some(relative)=(node.parent as usize).checked_sub(bound.view.root)else{return Ok(None);};
            let Some(logical)=bound.base.checked_add(relative)else{return Ok(None);};
            if logical>=bound.end{return Ok(None);}Some(logical)
        };
        observer("coordinate-scalar-return");
        Ok(Some(Coordinate{root,parent,edge:if parent.is_none(){0}else{node.edge as usize},count:node.count as usize,depth:depth as usize}))
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
            if !self.belongs_for_access(owner,ctx)?{return Ok(None);}
            Ok(self.roots.get(role).filter(|node|**node<ctx.limits().max_values).map(|node|OwnerCursor{lineage:Arc::clone(&self.lineage),node:*node}))
        })
    }
    pub(super) fn child(&self,owner:&CompiledSchema,cursor:&OwnerCursor,edge:usize,ctx:&mut Context<'_>)->Result<Option<OwnerCursor>,EngineError> {
        ctx.with_constructor_site("ctor.location-lookup",|ctx|{
            ctx.charge_work(20,Utf16::default())?;
            if !self.belongs_for_access(owner,ctx)?||!Arc::ptr_eq(&cursor.lineage,&self.lineage){return Ok(None);}
            let Some(node)=self.coordinate(cursor.node,ctx)?else{return Ok(None);};
            if cursor.node>=ctx.limits().max_values||edge>=node.count||node.depth>=ctx.limits().max_depth{return Ok(None);}
            let child=match &self.storage{
                CoordinateStorage::Materialized{nodes,edges}=>{
                    let Some(raw)=nodes.get(cursor.node)else{return Ok(None);};
                    let Some(position)=(raw.first as usize).checked_add(edge)else{return Ok(None);};
                    let Some(child)=edges.get(position).copied()else{return Ok(None);};child
                },
                CoordinateStorage::Views{roles,..}=>{
                    ctx.charge_work(4,Utf16::default())?;
                    let Some(bound)=roles.get(node.root)else{return Ok(None);};
                    let Some(relative)=cursor.node.checked_sub(bound.base)else{return Ok(None);};
                    let Some(raw)=bound.view.root.checked_add(relative)else{return Ok(None);};
                    // Skip immutable sibling extents, never their subtrees. Every
                    // preceding sibling check is metered by Structure::child.
                    ctx.charge_work(2,Utf16::default())?;
                    let physical=admitted_structure::View{structure:Arc::clone(&bound.view.structure),root:raw};
                    let Some(child)=admitted_structure::Structure::child(&physical,edge,ctx)?else{return Ok(None);};
                    ctx.charge_work(4,Utf16::default())?;
                    let Some(relative)=child.root.checked_sub(bound.view.root)else{return Ok(None);};
                    let Some(logical)=bound.base.checked_add(relative)else{return Ok(None);};
                    if logical>=bound.end{return Ok(None);}logical
                },
            };
            if child>=ctx.limits().max_values{return Ok(None);}
            Ok(Some(OwnerCursor{lineage:Arc::clone(&self.lineage),node:child}))
        })
    }
    pub(super) fn read<'a>(&self,owner:&'a CompiledSchema,cursor:&OwnerCursor,ctx:&mut Context<'_>)->Result<Option<&'a Value>,EngineError> {
        ctx.with_constructor_site("ctor.location-lookup",|ctx|{
            ctx.charge_work(12,Utf16::default())?;
            if !self.belongs_for_access(owner,ctx)?||!Arc::ptr_eq(&cursor.lineage,&self.lineage){return Ok(None);}
            fn read<'a>(table:&OwnerLocations,owner:&'a CompiledSchema,id:usize,ctx:&mut Context<'_>)->Result<Option<&'a Value>,EngineError>{
                ctx.charge_work(8,Utf16::default())?;
                if id>=ctx.limits().max_values{return Ok(None);}
                let Some(node)=table.coordinate(id,ctx)?else{return Ok(None);};
                owner_walk_event("ow1-original-ancestor-hop",node.root,id);
                if node.depth>ctx.limits().max_depth{return Ok(None);}
                let Some(parent)=node.parent else{return Ok(if node.root==0{Some(&*owner.schema)}else{owner.catalogue_entries().get(node.root-1).map(|(_,v)|v)});};
                let Some(value)=read(table,owner,parent,ctx)?else{return Ok(None);};
                Ok(match value{Value::Object(v)=>v.get(node.edge).map(|(_,v)|v),Value::Array(v)=>v.get(node.edge),_=>None})
            }
            read(self,owner,cursor.node,ctx)
        })
    }

}
impl OwnerCursor {
    /// Production-private logical key from an actual readable owner cursor.
    /// No cursor or admission proof is created; all original read/limit checks
    /// execute before returning the distinct logical role and table ordinal.
    pub(super) fn logical_position(&self, owner: &CompiledSchema, ctx: &mut Context<'_>) -> Result<Option<(usize, usize)>, EngineError> {
        // Owner field/option read and borrowed-table local, before effect.
        ctx.charge_work(4, Utf16::default())?;
        let Some(table) = &owner.owner_locations else { return Ok(None); };
        if table.read(owner, self, ctx)?.is_none() { return Ok(None); }
        // Checked coordinate observation plus two-field key movement. The
        // bound-view coordinate path separately admits its actual translation.
        ctx.charge_work(4, Utf16::default())?;
        Ok(table.coordinate(self.node, ctx)?.map(|coordinate| (coordinate.root, self.node)))
    }
    /// Test-only readback from an actual cursor: full existing owner/lineage,
    /// effective-limit and read checks first. No cursor/token is minted here.
    #[cfg(test)]
    pub(super) fn logical_position_for_test(&self,owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<(usize,usize)>,EngineError>{
        let Some(table)=&owner.owner_locations else{return Ok(None);};
        if table.read(owner,self,ctx)?.is_none(){return Ok(None);}
        Ok(table.coordinate(self.node,ctx)?.map(|coordinate|(coordinate.root,self.node)))
    }
    pub(super) fn same_location(&self,other:&Self)->bool {
        Arc::ptr_eq(&self.lineage,&other.lineage) && self.node==other.node
    }
    pub(super) fn get<'a>(&self,owner:&'a CompiledSchema,ctx:&mut Context<'_>)->Result<&'a Value,EngineError>{
        let Some(table)=&owner.owner_locations else{return Err(schema_error(&Utf16::default(),"Owner location unavailable"));};
        table.read(owner,self,ctx)?.ok_or_else(||schema_error(&Utf16::default(),"Owner location does not belong to this immutable owner"))
    }
}

#[cfg(test)]
#[path="schema_owner_locations_compact_independent_tests.rs"]
mod compact_independent_tests;

#[cfg(test)]
#[path="schema_admitted_structure_independent_tests.rs"]
mod admitted_structure_independent_tests;

#[cfg(test)]
#[path="schema_bound_coordinate_views_independent_tests.rs"]
mod bound_coordinate_views_independent_tests;

#[cfg(test)]
#[path="schema_fused_owner_traversal_independent_tests.rs"]
mod fused_owner_traversal_independent_tests;

// OW1 borrowed custody: only actual owner readback/ordered child reads mint it.
// A Rust borrow prevents owner movement/mutation while this location is live.
pub(super) struct CheckedLocation<'a> {
    owner: &'a CompiledSchema, table: &'a OwnerLocations, value: &'a Value,
    cursor: OwnerCursor, coordinate: Coordinate,
    limits: crate::context::Limits, profile: crate::context::ResourceProfile,
}
/// Borrowed owner-bound identity for immediate consumers. It carries the real
/// owner/table/value and logical node, but no ref-counted owning cursor.
pub(super) struct BorrowedCheckedLocation<'a> {
    owner: &'a CompiledSchema, table: &'a OwnerLocations, value: &'a Value,
    node: usize, coordinate: Coordinate,
    limits: crate::context::Limits, profile: crate::context::ResourceProfile,
}
pub(super) enum CheckedOwnerLocation<'binding,'owner> where 'owner:'binding {
    Owned(CheckedLocation<'owner>),
    Fused(BorrowedChild<'binding,'owner>),
}
/// One admitted owner/root binding for a recursive preflight invocation.
/// It owns the legacy seed and only borrows the actual immutable role view.
pub(super) struct FusedBinding<'a>{
    seed:CheckedLocation<'a>, bound:&'a BoundRole,
}
#[derive(Clone,Copy)]
pub(super) struct BorrowedChild<'binding,'owner> where 'owner:'binding {
    binding:&'binding FusedBinding<'owner>, value:&'owner Value,
    node:usize, physical_node:usize, coordinate:Coordinate,
}
pub(super) struct FusedChildren<'binding,'owner> where 'owner:'binding {
    parent:BorrowedChild<'binding,'owner>, parent_end:usize, count:usize,
    next_edge:usize, next_node:usize, valid:bool,
}
#[derive(Clone,Copy)]
struct FusedSelectedRow{parent:u32,edge:u32,end:usize}
pub(super) enum OwnerRoute<'a>{Fused(FusedBinding<'a>),Legacy(CheckedLocation<'a>)}
pub(super) struct OrderedOwnerChildren<'a> {
    parent: CheckedLocation<'a>, physical: Option<admitted_structure::OrderedStructureChildren<'a>>,
    role: usize, base: usize, physical_root: usize, logical_end: usize, valid: bool,
}
fn walk_words<T>() -> usize { std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>()) }
#[cfg(test)]
thread_local! {static OWNER_WALK_OBSERVER:std::cell::RefCell<Option<Box<dyn FnMut(&'static str,usize,usize)>>>=std::cell::RefCell::new(None);}
#[cfg(test)]
pub(super) fn observe_owner_walk<T>(observer:Box<dyn FnMut(&'static str,usize,usize)>,operation:impl FnOnce()->T)->T {
    struct Restore(Option<Box<dyn FnMut(&'static str,usize,usize)>>);
    impl Drop for Restore {fn drop(&mut self){OWNER_WALK_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
    let prior=OWNER_WALK_OBSERVER.with(|s|s.borrow_mut().replace(observer));let _restore=Restore(prior);operation()
}
pub(super) fn owner_walk_event(event:&'static str,role:usize,node:usize) {
    #[cfg(test)]
    {let observer=OWNER_WALK_OBSERVER.with(|s|s.borrow_mut().take());if let Some(observer)=observer {
        struct Restore(Option<Box<dyn FnMut(&'static str,usize,usize)>>);
        impl Drop for Restore {fn drop(&mut self){OWNER_WALK_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
        let mut restore=Restore(Some(observer));if let Some(observer)=restore.0.as_mut(){observer(event,role,node);}
    }}
    #[cfg(not(test))]let _=(event,role,node);
}
impl OwnerLocations {
    pub(super) fn checked<'a>(&'a self,owner:&'a CompiledSchema,cursor:&OwnerCursor,ctx:&mut Context<'_>)->Result<Option<CheckedLocation<'a>>,EngineError>{
        let Some(value)=self.read(owner,cursor,ctx)? else {return Ok(None);};
        let Some(coordinate)=self.coordinate(cursor.node,ctx)? else {return Ok(None);};
        ctx.charge_work(walk_words::<CheckedLocation<'a>>()+walk_words::<crate::context::Limits>()+8,Utf16::default())?;
        if !self.belongs_for_access(owner,ctx)? {return Ok(None);}
        owner_walk_event("ow1-checked-publication",coordinate.root,cursor.node);
        Ok(Some(CheckedLocation{owner,table:self,value,cursor:cursor.clone(),coordinate,limits:ctx.limits(),profile:ctx.profile()}))
    }
    pub(super) fn checked_borrowed<'a>(&'a self,owner:&'a CompiledSchema,cursor:&OwnerCursor,ctx:&mut Context<'_>)->Result<Option<BorrowedCheckedLocation<'a>>,EngineError>{
        let Some(value)=self.read(owner,cursor,ctx)? else{return Ok(None);};
        let Some(coordinate)=self.coordinate(cursor.node,ctx)? else{return Ok(None);};
        ctx.charge_work(walk_words::<BorrowedCheckedLocation<'a>>()+walk_words::<crate::context::Limits>()+8,Utf16::default())?;
        if !self.belongs_for_access(owner,ctx)?{return Ok(None);}
        let checked=BorrowedCheckedLocation{owner,table:self,value,node:cursor.node,coordinate,limits:ctx.limits(),profile:ctx.profile()};
        #[cfg(test)] owner_walk_event("ft1-borrowed-binding-publication",coordinate.root,cursor.node);
        Ok(Some(checked))
    }
}
impl<'a> CheckedLocation<'a> {
    #[cfg(test)]
    pub(super) fn snapshot_for_test(&self)->(usize,usize,&'a Value){(self.coordinate.root,self.cursor.node,self.value)}
    pub(super) fn read(&self,owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<&'a Value>,EngineError>{
        ctx.charge_work(walk_words::<crate::context::Limits>()+12,Utf16::default())?;
        if !std::ptr::eq(owner,self.owner) || self.limits!=ctx.limits() || self.profile!=ctx.profile() || !self.table.belongs_for_access(owner,ctx)? || self.cursor.node>=ctx.limits().max_values || self.coordinate.depth>ctx.limits().max_depth {return Ok(None);}
        // Pointer equality above is only an owner argument discriminator. The
        // node came from a private real read, with the same immutable lineage.
        owner_walk_event("ow1-checked-read",self.coordinate.root,self.cursor.node);
        Ok(Some(self.value))
    }
    pub(super) fn cursor(&self)->&OwnerCursor { &self.cursor }
    #[cfg(test)]
    pub(super) fn observe_ft1_transfer(&self) { owner_walk_event("ft1-checked-child-transferred",self.coordinate.root,self.cursor.node); }
    /// Materialize the original owner cursor only when fallback or a retaining
    /// plan actually needs a duplicate. Admission precedes the Arc clone.
    pub(super) fn materialize_cursor(&self,ctx:&mut Context<'_>)->Result<OwnerCursor,EngineError>{
        ctx.charge_work(1,Utf16::default())?;
        #[cfg(test)]
        owner_walk_event("ft1-owning-cursor-materialized",self.coordinate.root,self.cursor.node);
        Ok(self.cursor.clone())
    }
    pub(super) fn same_location(&self,cursor:&OwnerCursor)->bool {
        self.cursor.same_location(cursor)
    }
    pub(super) fn observe_consumption(&self,site:&'static str) {
        #[cfg(test)] owner_walk_event(site,self.coordinate.root,self.cursor.node);
        #[cfg(not(test))] let _=site;
    }
    pub(super) fn logical_position(&self,owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<(usize,usize)>,EngineError>{
        if self.read(owner,ctx)?.is_none(){return Ok(None);}
        ctx.charge_work(3,Utf16::default())?;
        Ok(Some((self.coordinate.root,self.cursor.node)))
    }
    pub(super) fn children(self,ctx:&mut Context<'_>)->Result<OrderedOwnerChildren<'a>,EngineError>{
        ctx.charge_work(walk_words::<OrderedOwnerChildren<'a>>()+walk_words::<crate::context::Limits>()+12,Utf16::default())?;
        let mut physical=None;let mut base=0;let mut physical_root=0;let mut logical_end=0;
        if self.read(self.owner,ctx)?.is_some() {
            if let CoordinateStorage::Views{roles,..}=&self.table.storage {
                ctx.charge_work(8,Utf16::default())?;
                if let Some(bound)=roles.get(self.coordinate.root) {
                    if let Some(raw)=self.cursor.node.checked_sub(bound.base).and_then(|n|bound.view.root.checked_add(n)) {
                        physical=bound.view.structure.ordered_children(raw,ctx)?;
                        base=bound.base;physical_root=bound.view.root;logical_end=bound.end;
                    }
                }
            }
        }
        owner_walk_event("ow1-walk-publication",self.coordinate.root,self.cursor.node);
        let role=self.coordinate.root;
        Ok(OrderedOwnerChildren{parent:self,physical,role,base,physical_root,logical_end,valid:true})
    }
}
impl<'a> BorrowedCheckedLocation<'a> {
    pub(super) fn read(&self,owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<&'a Value>,EngineError>{
        ctx.charge_work(walk_words::<crate::context::Limits>()+12,Utf16::default())?;
        if !std::ptr::eq(owner,self.owner)||self.limits!=ctx.limits()||self.profile!=ctx.profile()
            ||!self.table.belongs_for_access(owner,ctx)?||self.node>=ctx.limits().max_values
            ||self.coordinate.depth>ctx.limits().max_depth{return Ok(None);}
        #[cfg(test)] owner_walk_event("ft1-borrowed-binding-readback",self.coordinate.root,self.node);
        Ok(Some(self.value))
    }
    pub(super) fn materialize_cursor(&self,ctx:&mut Context<'_>)->Result<OwnerCursor,EngineError>{
        ctx.charge_work(1,Utf16::default())?;
        #[cfg(test)] owner_walk_event("ft1-owning-cursor-materialized",self.coordinate.root,self.node);
        Ok(OwnerCursor{lineage:Arc::clone(&self.table.lineage),node:self.node})
    }
    pub(super) fn same_location(&self,cursor:&OwnerCursor)->bool{
        Arc::ptr_eq(&self.table.lineage,&cursor.lineage)&&self.node==cursor.node
    }
    pub(super) fn observe_consumption(&self,site:&'static str){
        #[cfg(test)] owner_walk_event(site,self.coordinate.root,self.node);
        #[cfg(not(test))] let _=site;
    }
    pub(super) fn logical_position(&self,owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<(usize,usize)>,EngineError>{
        if self.read(owner,ctx)?.is_none(){return Ok(None);}
        ctx.charge_work(3,Utf16::default())?;
        Ok(Some((self.coordinate.root,self.node)))
    }
    #[cfg(test)]
    pub(super) fn observe_transfer(&self){owner_walk_event("ft1-borrowed-child-transferred",self.coordinate.root,self.node);}
}
impl<'a> FusedBinding<'a>{
    pub(super) fn try_new(seed:CheckedLocation<'a>,ctx:&mut Context<'_>)->Result<OwnerRoute<'a>,EngineError>{
        ctx.charge_work(walk_words::<OwnerRoute<'a>>()+1,Utf16::default())?;
        let CoordinateStorage::Views{roles,..}=&seed.table.storage else{return Ok(OwnerRoute::Legacy(seed));};
        ctx.charge_work(walk_words::<Self>()+walk_words::<crate::context::Limits>()+9,Utf16::default())?;
        if seed.read(seed.owner,ctx)?.is_none(){return Ok(OwnerRoute::Legacy(seed));}
        ctx.charge_work(2,Utf16::default())?;
        let Some(bound)=roles.get(seed.coordinate.root)else{return Ok(OwnerRoute::Legacy(seed));};
        let Some(raw)=seed.cursor.node.checked_sub(bound.base).and_then(|n|bound.view.root.checked_add(n))else{return Ok(OwnerRoute::Legacy(seed));};
        if raw>=bound.physical_end||seed.cursor.node>=bound.end||seed.cursor.node>=ctx.limits().max_values
            ||seed.coordinate.depth>ctx.limits().max_depth||!bound.view.structure.compatible(ctx){return Ok(OwnerRoute::Legacy(seed));}
        ctx.charge_work(walk_words::<&BoundRole>()+2,Utf16::default())?;
        let binding=Self{seed,bound};
        #[cfg(test)] owner_walk_event("ft1-binding-publication",binding.seed.coordinate.root,binding.seed.cursor.node);
        Ok(OwnerRoute::Fused(binding))
    }
    pub(super) fn root(&self,ctx:&mut Context<'_>)->Result<BorrowedChild<'_,'a>,EngineError>{
        ctx.charge_work(walk_words::<BorrowedChild<'_,'a>>()+4,Utf16::default())?;
        let physical_node=self.bound.view.root+(self.seed.cursor.node-self.bound.base);
        let coordinate=Coordinate{root:self.seed.coordinate.root,parent:self.seed.coordinate.parent,edge:self.seed.coordinate.edge,count:self.seed.coordinate.count,depth:self.seed.coordinate.depth};
        Ok(BorrowedChild{binding:self,value:self.seed.value,node:self.seed.cursor.node,physical_node,coordinate})
    }
    pub(super) fn children<'binding>(&'binding self,parent:&BorrowedChild<'binding,'a>,ctx:&mut Context<'_>)->Result<Option<FusedChildren<'binding,'a>>,EngineError> where 'a:'binding {
        ctx.charge_work(walk_words::<FusedChildren<'binding,'a>>()+walk_words::<crate::context::Limits>()+10,Utf16::default())?;
        if !std::ptr::eq(parent.binding,self)||parent.read(ctx)?.is_none(){return Ok(None);}
        let structure=&self.bound.view.structure;
        if self.seed.limits!=ctx.limits()||self.seed.profile!=ctx.profile()||!structure.compatible(ctx){return Ok(None);}
        let Some(row)=structure.node(parent.physical_node)else{return Ok(None);};
        if parent.physical_node>=self.bound.physical_end||parent.physical_node>=ctx.limits().max_values||row.end as usize>self.bound.physical_end
            ||row.end as usize>structure.extent()||row.depth as usize>ctx.limits().max_depth
            ||parent.node>=self.bound.end||parent.node>=ctx.limits().max_values{return Ok(None);}
        let walk=FusedChildren{parent:*parent,parent_end:row.end as usize,count:row.count as usize,next_edge:0,next_node:row.first as usize,valid:true};
        #[cfg(test)] owner_walk_event("ft1-frontier-publication",parent.coordinate.root,parent.node);
        Ok(Some(walk))
    }
    fn original<'binding>(&'binding self,parent:&BorrowedChild<'binding,'a>,edge:usize,ctx:&mut Context<'_>)->Result<Option<CheckedOwnerLocation<'binding,'a>>,EngineError> where 'a:'binding {
        #[cfg(test)] owner_walk_event("ft1-original-fallback",parent.coordinate.root,parent.node);
        let cursor=parent.materialize_cursor(ctx)?;
        let Some(child)=self.seed.table.child(self.seed.owner,&cursor,edge,ctx)?else{return Ok(None);};
        let Some(checked)=self.seed.table.checked(self.seed.owner,&child,ctx)?else{return Ok(None);};
        ctx.charge_work(walk_words::<CheckedOwnerLocation<'binding,'a>>()+1,Utf16::default())?;
        Ok(Some(CheckedOwnerLocation::Owned(checked)))
    }
}
impl<'binding,'owner:'binding> BorrowedChild<'binding,'owner>{
    pub(super) fn value(&self)->&'owner Value{self.value}
    pub(super) fn logical_position(&self)->(usize,usize){(self.coordinate.root,self.node)}
    pub(super) fn read(&self,ctx:&mut Context<'_>)->Result<Option<&'owner Value>,EngineError>{
        let seed=&self.binding.seed;
        ctx.charge_work(walk_words::<crate::context::Limits>()+10,Utf16::default())?;
        if self.node>=ctx.limits().max_values||self.coordinate.depth>ctx.limits().max_depth
            ||seed.limits!=ctx.limits()||seed.profile!=ctx.profile()
            ||!seed.table.belongs_for_access(seed.owner,ctx)?{return Ok(None);}
        #[cfg(test)] owner_walk_event("ft1-borrowed-readback",self.coordinate.root,self.node);
        Ok(Some(self.value))
    }
    pub(super) fn read_for(&self,owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<&'owner Value>,EngineError>{
        ctx.charge_work(walk_words::<&CompiledSchema>()+1,Utf16::default())?;
        if !std::ptr::eq(owner,self.binding.seed.owner){return Ok(None);}
        self.read(ctx)
    }
    pub(super) fn materialize_cursor(&self,ctx:&mut Context<'_>)->Result<OwnerCursor,EngineError>{
        ctx.charge_work(1,Utf16::default())?;
        #[cfg(test)] owner_walk_event("ft1-owning-cursor-materialized",self.coordinate.root,self.node);
        Ok(OwnerCursor{lineage:Arc::clone(&self.binding.seed.cursor.lineage),node:self.node})
    }
    pub(super) fn same_location(&self,cursor:&OwnerCursor)->bool{
        Arc::ptr_eq(&self.binding.seed.cursor.lineage,&cursor.lineage)&&self.node==cursor.node
    }
    pub(super) fn children(&self,ctx:&mut Context<'_>)->Result<Option<FusedChildren<'binding,'owner>>,EngineError>{
        self.binding.children(self,ctx)
    }
    #[cfg(test)]
    pub(super) fn observe_transfer(&self){owner_walk_event("ft1-borrowed-child-transferred",self.coordinate.root,self.node);}
}
impl<'binding,'owner:'binding> FusedChildren<'binding,'owner>{
    pub(super) fn select(&mut self,edge:usize,ctx:&mut Context<'_>)->Result<Option<CheckedOwnerLocation<'binding,'owner>>,EngineError>{
        struct Guard<'s,'b,'o>{walk:&'s mut FusedChildren<'b,'o>,success:bool}
        impl Drop for Guard<'_,'_,'_>{fn drop(&mut self){if !self.success{self.walk.valid=false;}}}
        let mut guard=Guard{walk:self,success:false};
        let result=guard.walk.select_inner(edge,ctx);guard.success=result.is_ok();result
    }
    fn select_inner(&mut self,edge:usize,ctx:&mut Context<'_>)->Result<Option<CheckedOwnerLocation<'binding,'owner>>,EngineError>{
        let binding=self.parent.binding;
        if !self.valid{return Ok(None);}
        ctx.charge_work(walk_words::<crate::context::Limits>()+12,Utf16::default())?;
        if !self.valid{return Ok(None);}
        let structure=&binding.bound.view.structure;
        if binding.seed.limits!=ctx.limits()||binding.seed.profile!=ctx.profile()||!structure.compatible(ctx)
            ||edge<self.next_edge||edge>=self.count{return binding.original(&self.parent,edge,ctx);}
        ctx.charge_work(2*walk_words::<usize>()+2,Utf16::default())?;
        let mut ordinal=self.next_edge;let mut physical=self.next_node;
        while ordinal<edge{
            ctx.charge_work(6,Utf16::default())?;
            let Some(row)=structure.node(physical)else{return binding.original(&self.parent,edge,ctx);};
            if row.parent as usize!=self.parent.physical_node||row.edge as usize!=ordinal
                ||row.end as usize<=physical||row.end as usize>self.parent_end{return binding.original(&self.parent,edge,ctx);}
            #[cfg(test)] owner_walk_event("ft1-intervening-row-read",self.parent.coordinate.root,physical);
            physical=row.end as usize;ordinal+=1;
        }
        ctx.charge_work(walk_words::<FusedSelectedRow>()+12,Utf16::default())?;
        let Some(source_row)=structure.node(physical)else{return binding.original(&self.parent,edge,ctx);};
        let row=FusedSelectedRow{parent:source_row.parent,edge:source_row.edge,end:source_row.end as usize};
        if row.parent as usize!=self.parent.physical_node||row.edge as usize!=edge||row.end<=physical
            ||row.end>self.parent_end||binding.seed.limits!=ctx.limits()
            ||binding.seed.profile!=ctx.profile()||!structure.compatible(ctx){return binding.original(&self.parent,edge,ctx);}
        #[cfg(test)] owner_walk_event("ft1-selected-row-read",self.parent.coordinate.root,physical);
        ctx.charge_work(walk_words::<BorrowedChild<'binding,'owner>>()+walk_words::<CheckedOwnerLocation<'binding,'owner>>()+walk_words::<crate::context::Limits>()+16,Utf16::default())?;
        if binding.seed.limits!=ctx.limits()||binding.seed.profile!=ctx.profile()||!structure.compatible(ctx){return binding.original(&self.parent,edge,ctx);}
        let Some(node)=physical.checked_sub(binding.bound.view.root).and_then(|n|binding.bound.base.checked_add(n))
            .filter(|n|*n<binding.bound.end&&*n<ctx.limits().max_values)else{return Ok(None);};
        if self.parent.coordinate.depth>=ctx.limits().max_depth{return Ok(None);}
        let value=match self.parent.value{Value::Object(v)=>v.get(edge).map(|(_,v)|v),Value::Array(v)=>v.get(edge),_=>None};
        let Some(value)=value else{return Ok(None);};
        #[cfg(test)] owner_walk_event("ft1-child-value-read",self.parent.coordinate.root,node);
        if binding.seed.limits!=ctx.limits()||binding.seed.profile!=ctx.profile()||!structure.compatible(ctx){return binding.original(&self.parent,edge,ctx);}
        let count=match value{Value::Object(v)=>v.len(),Value::Array(v)=>v.len(),_=>0};
        let child=BorrowedChild{binding,value,node,physical_node:physical,coordinate:Coordinate{
            root:self.parent.coordinate.root,parent:Some(self.parent.node),edge,count,depth:self.parent.coordinate.depth+1}};
        self.next_edge=edge+1;self.next_node=row.end;
        #[cfg(test)] owner_walk_event("ft1-borrowed-child-published",child.coordinate.root,node);
        Ok(Some(CheckedOwnerLocation::Fused(child)))
    }
}
impl<'binding,'owner:'binding> CheckedOwnerLocation<'binding,'owner> {
    pub(super) fn read(&self,owner:&CompiledSchema,ctx:&mut Context<'_>)->Result<Option<&'owner Value>,EngineError>{
        match self{Self::Owned(location)=>location.read(owner,ctx),Self::Fused(location)=>location.read_for(owner,ctx)}
    }
    #[cfg(test)]
    pub(super) fn observe_consumption(&self,site:&'static str){
        match self{Self::Owned(location)=>location.observe_consumption(site),Self::Fused(location)=>{
            owner_walk_event(site,location.coordinate.root,location.node);
        }}
    }
}

impl<'a> OrderedOwnerChildren<'a> {
    pub(super) fn child(&mut self,edge:usize,ctx:&mut Context<'_>)->Result<Option<CheckedLocation<'a>>,EngineError>{
        struct Guard<'s,'a>{state:&'s mut OrderedOwnerChildren<'a>,success:bool}
        impl Drop for Guard<'_,'_>{fn drop(&mut self){if !self.success{self.state.valid=false;}}}
        let mut guard=Guard{state:self,success:false};let result=guard.state.child_impl(edge,ctx);guard.success=result.is_ok();result
    }
    fn original(&self,edge:usize,ctx:&mut Context<'_>)->Result<Option<CheckedLocation<'a>>,EngineError>{
        owner_walk_event("ow1-original-fallback",self.role,self.parent.cursor.node);
        let Some(cursor)=self.parent.table.child(self.parent.owner,&self.parent.cursor,edge,ctx)? else{return Ok(None);};
        self.parent.table.checked(self.parent.owner,&cursor,ctx)
    }
    fn child_impl(&mut self,edge:usize,ctx:&mut Context<'_>)->Result<Option<CheckedLocation<'a>>,EngineError>{
        if !self.valid {return Ok(None);}
        ctx.charge_work(walk_words::<crate::context::Limits>()+12,Utf16::default())?;
        if !self.valid{return Ok(None);}
        if self.parent.read(self.parent.owner,ctx)?.is_none(){return self.original(edge,ctx);}
        let Some(physical)=&mut self.physical else{return self.original(edge,ctx);};
        let Some(raw)=physical.select(edge,ctx)? else{return self.original(edge,ctx);};
        ctx.charge_work(walk_words::<CheckedLocation<'a>>()+walk_words::<crate::context::Limits>()+16,Utf16::default())?;
        let Some(node)=raw.checked_sub(self.physical_root).and_then(|n|self.base.checked_add(n)).filter(|n|*n<self.logical_end&&*n<ctx.limits().max_values) else{return Ok(None);};
        if self.parent.coordinate.depth>=ctx.limits().max_depth{return Ok(None);}
        owner_walk_event("ow1-child-value-read",self.role,node);
        let value=match self.parent.value{Value::Object(v)=>v.get(edge).map(|(_,v)|v),Value::Array(v)=>v.get(edge),_=>None};
        let Some(value)=value else{return Ok(None);};
        let count=match value{Value::Object(v)=>v.len(),Value::Array(v)=>v.len(),_=>0};
        owner_walk_event("ow1-child-publication",self.role,node);
        Ok(Some(CheckedLocation{owner:self.parent.owner,table:self.parent.table,value,cursor:OwnerCursor{lineage:Arc::clone(&self.parent.cursor.lineage),node},coordinate:Coordinate{root:self.role,parent:Some(self.parent.cursor.node),edge,count,depth:self.parent.coordinate.depth+1},limits:ctx.limits(),profile:ctx.profile()}))
    }
}

#[cfg(test)]
#[path="schema_owner_traversal_independent_tests.rs"]
mod owner_traversal_independent_tests;

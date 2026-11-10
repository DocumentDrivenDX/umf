// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private input custody, never a schema/Registry success capability.
use super::*;
use crate::engine::ResourceSet;

#[derive(Clone,Debug,Default)]
struct CoreFacts { root_id:Option<usize>, anchor_free:bool, nested_id:bool }
#[derive(Clone,Copy,Debug)]
pub(crate) enum BankRoot { Core(usize), Meta }
#[derive(Debug)]
enum Owner { Core(Arc<ResourceSet>), Meta(Arc<Value>), CountedCore(Arc<ResourceSet>) }

#[allow(dead_code)]
enum OriginalOwner { Core(Arc<ResourceSet>), Meta(Arc<Value>) }

const _: () = {
    assert!(std::mem::size_of::<Owner>() == std::mem::size_of::<OriginalOwner>());
    assert!(std::mem::align_of::<Owner>() == std::mem::align_of::<OriginalOwner>());
};
#[derive(Debug)]
struct Row { role:usize, id_member:usize, schema_member:usize }
#[derive(Debug)]
pub(crate) struct SchemaBank {
    owner:Owner,
    rows:Vec<Row>,
    facts:Vec<CoreFacts>,
    structures:Vec<Option<Arc<admitted_structure::Structure>>>,
    parsed_owner:Option<Arc<crate::serialization::CompletedOwnedJson>>,
    limits:crate::context::Limits,
    lifetime:Arc<()>,
    meta_group:usize,
    meta_root:usize,
    meta_resources:usize,
}
pub(crate) struct AdmittedCore {
    pub(crate) resources:Arc<ResourceSet>,
    pub(crate) bank:Arc<SchemaBank>,
}
#[derive(Default)]
struct BankEvents<'a>{
    #[cfg(test)] observer:Option<&'a mut dyn FnMut(&'static str)>,
    lifetime:std::marker::PhantomData<&'a ()>,
}
impl BankEvents<'_>{fn event(&mut self,label:&'static str){
    #[cfg(test)] if let Some(observer)=self.observer.as_deref_mut(){observer(label);}
    #[cfg(not(test))] let _=label;
}}
fn fields(v:&Value)->&[(Utf16,Value)] {match v {Value::Object(m)=>m,_=>&[]}}
fn indexed_field(v:&Value,i:usize)->&Value {&fields(v)[i].1}
fn ascii(k:&Utf16,name:&str)->bool {k.len()==name.len()&&k.units().iter().copied().eq(name.bytes().map(u16::from))}
fn find(v:&Value,name:&str,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<Option<usize>,EngineError> {
    for(i,(key,_))in fields(v).iter().enumerate(){
        ctx.charge_work(key.len().min(name.len()).saturating_add(1),Utf16::default())?;
        events.event("projection-key");
        if ascii(key,name){return Ok(Some(i));}
    }
    Ok(None)
}
pub(crate) fn construction_lifetime(ctx:&mut Context<'_>)->Result<Arc<()>,EngineError>{
    let state=ctx.schema_construction.clone().expect("private construction bank");
    ctx.charge_work(2,Utf16::default())?;
    let existing=state.borrow().lifetime.clone();
    if let Some(token)=existing {return Ok(token);}
    ctx.charge_work(1,Utf16::default())?;
    let candidate=Arc::new(());
    let mut state=state.borrow_mut();
    Ok(Arc::clone(state.lifetime.get_or_insert(candidate)))
}
fn core_member(member:usize,key:&Utf16,child:&Value,depth:usize,ctx:&mut Context<'_>,events:&mut BankEvents<'_>,facts:&mut CoreFacts)->Result<(),EngineError>{
                ctx.charge_work(1,Utf16::default())?;
                events.event("input-fact");
                // Length dispatch removes actual repeated ASCII scans; pay
                // only the metadata and units this classifier really reads.
                fn matches_units(key:&Utf16,word:&str,ctx:&mut Context<'_>)->Result<bool,EngineError>{
                    for i in 0..word.len(){ctx.charge_work(2,Utf16::default())?;if key.units()[i]!=u16::from(word.as_bytes()[i]){return Ok(false);}}
                    Ok(true)
                }
                match key.len(){
                    14=>if matches_units(key,"$dynamicAnchor",ctx)? {facts.anchor_free=false;},
                    16=>if matches_units(key,"$recursiveAnchor",ctx)? {facts.anchor_free=false;},
                    n@ (2|3)=>{
                        ctx.charge_work(1,Utf16::default())?;
                        if matches!(child,Value::String(_)) && matches_units(key,if n==2{"id"}else{"$id"},ctx)? {
                            if depth==0 && n==3 {facts.root_id=Some(member);}
                            if depth!=0 {facts.nested_id=true;facts.anchor_free=false;}
                        }
                    },_=>{},
                }
                Ok(())
}
impl SchemaBank {
    pub(crate) fn admit_core(resources:ResourceSet,ctx:&mut Context<'_>)->Result<AdmittedCore,EngineError> {
        Self::admit_core_observed(resources,ctx,&mut BankEvents::default())
    }
    #[cfg(test)]
    fn admit_core_with_events(resources:ResourceSet,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<AdmittedCore,EngineError>{
        Self::admit_core_observed(resources,ctx,&mut BankEvents{observer:Some(observer),lifetime:std::marker::PhantomData})
    }
    fn admit_core_observed(resources:ResourceSet,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<AdmittedCore,EngineError>{
        fn admit(value:Value,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<(Value,CoreFacts,Option<Arc<admitted_structure::Structure>>),EngineError>{
            let mut facts=CoreFacts{anchor_free:true,..Default::default()};
            let (value,structure)=crate::value::admit_owned_json_with_structure(value,ctx,&mut |member,key,child,depth,ctx|core_member(member,key,child,depth,ctx,events,&mut facts))?;
            Ok((value,facts,structure))
        }
        // Keep original first CoreJSON admissions and their error order.
        let(core_schema,core,core_structure)=admit(resources.core_schema,ctx,events)?;
        let(reference_schema,reference,reference_structure)=admit(resources.reference_schema,ctx,events)?;
        let(package_schema,package,package_structure)=admit(resources.package_schema,ctx,events)?;
        let constraints=crate::value::admit_owned_json(resources.constraints,ctx)?;
        let domain_policy=crate::value::admit_owned_json(resources.domain_policy,ctx)?;
        Self::publish_core(ResourceSet{core_schema,reference_schema,package_schema,constraints,domain_policy},[core,reference,package],[core_structure,reference_structure,package_structure],ctx,events)
    }
    fn publish_core(resources:ResourceSet,facts:[CoreFacts;3],structures:[Option<Arc<admitted_structure::Structure>>;3],ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<AdmittedCore,EngineError>{
        let ResourceSet{core_schema,reference_schema,package_schema,constraints,domain_policy}=resources;
        let [core,reference,package]=facts;
        let [core_structure,reference_structure,package_structure]=structures;
        ctx.charge_work(std::mem::size_of::<ResourceSet>().div_ceil(std::mem::size_of::<usize>()).saturating_add(2),Utf16::default())?;
        events.event("owner-allocation");
        let resources=Arc::new(ResourceSet{core_schema,reference_schema,package_schema,constraints,domain_policy});
        let lifetime=construction_lifetime(ctx)?;
        let words=std::mem::size_of::<Self>().div_ceil(std::mem::size_of::<usize>()).saturating_add(3*std::mem::size_of::<Row>().div_ceil(std::mem::size_of::<usize>())).saturating_add(3*std::mem::size_of::<CoreFacts>().div_ceil(std::mem::size_of::<usize>())).saturating_add(3).saturating_add(3*std::mem::size_of::<Option<Arc<admitted_structure::Structure>>>().div_ceil(std::mem::size_of::<usize>()));
        ctx.charge_work(words,Utf16::default())?;
        events.event("row-allocation");
        let mut rows=Vec::new();rows.try_reserve_exact(3).map_err(|_|EngineError::new("LIMIT",Utf16::default(),"Input bank allocation unavailable"))?;
        let facts=vec![core,reference,package];
        for(role,fact)in facts.iter().enumerate(){if let Some(id_member)=fact.root_id {rows.push(Row{role,id_member,schema_member:0});}}
        events.event("bank-publication");
        let bank=Arc::new(Self{owner:Owner::Core(Arc::clone(&resources)),rows,facts,structures:vec![core_structure,reference_structure,package_structure],parsed_owner:None,limits:ctx.limits(),lifetime,meta_group:0,meta_root:0,meta_resources:0});
        Ok(AdmittedCore{resources,bank})
    }
    pub(crate) fn admit_core_owned(resources:crate::engine::OwnedResourceSet,operation:&crate::value::OwnedCoreOperation,ctx:&mut Context<'_>)->Result<AdmittedCore,EngineError>{
        fn collect(value:Value,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<(Value,CoreFacts,Option<Arc<admitted_structure::Structure>>),EngineError>{
            fn visit(value:&Value,depth:usize,path:&mut Utf16,structure:&mut admitted_structure::Builder,facts:&mut CoreFacts,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<(),EngineError>{
                structure.enter(depth,ctx,path)?;
                match value {
                    Value::Object(members)=>for(member,(key,child))in members.iter().enumerate(){
                        core_member(member,key,child,depth,ctx,events,facts)?;
                        structure.member(key,matches!(child,Value::String(_)),ctx,path)?;
                        let parent=path.push_owned_path_segment(key,ctx)?;
                        visit(child,depth+1,path,structure,facts,ctx,events)?;
                        path.restore_owned_path(parent,ctx)?;
                    },
                    Value::Array(items)=>for(index,child)in items.iter().enumerate(){
                        let digits=if index==0{1}else{index.ilog10() as usize+1};
                        ctx.charge_work_with_path(digits.saturating_mul(3).saturating_add(2),path)?;
                        let segment=Utf16::from(index.to_string());
                        let parent=path.push_owned_path_segment(&segment,ctx)?;
                        visit(child,depth+1,path,structure,facts,ctx,events)?;
                        path.restore_owned_path(parent,ctx)?;
                    },_=>{},
                }
                structure.leave(ctx,path)
            }
            ctx.charge_work(2,Utf16::default())?;
            let mut path=Utf16::from("#");let mut structure=admitted_structure::Builder::default();
            let mut facts=CoreFacts{anchor_free:true,..Default::default()};
            visit(&value,0,&mut path,&mut structure,&mut facts,ctx,events)?;
            let structure=structure.complete(ctx)?;Ok((value,facts,structure))
        }
        fn consume(carrier:crate::value::OwnedCoreJson,operation:&crate::value::OwnedCoreOperation,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<(Value,CoreFacts,Option<Arc<admitted_structure::Structure>>),EngineError>{
            let(value,structure)=carrier.into_core_metadata(operation,ctx)?;
            if let Some(structure)=structure {
                // Private field custody ties this complete collection to the
                // same consumed immutable Value. No descriptor/tree reload.
                ctx.charge_work(std::mem::size_of::<CoreFacts>().div_ceil(std::mem::size_of::<usize>()).saturating_add(6),Utf16::default())?;
                if let Some(role)=structure.core_role_facts() {
                    let facts=CoreFacts{root_id:role.root_id,nested_id:role.nested_id,anchor_free:!role.anchors&&!role.nested_id};
                    events.event("typed-structure-consumption");
                    return Ok((value,facts,Some(structure)));
                }
            }
            // Absent/incomplete metadata never creates a new fast admission:
            // carrier consumption already retained original JSON validation
            // when custody mismatched; actual collection is still paid here.
            collect(value,ctx,events)
        }
        let events=&mut BankEvents::default();
        // Each carrier is consumed only at its original admission position.
        // Compatibility failure executes the full original shared validator.
        let(core_schema,core,core_structure)=consume(resources.core_schema,operation,ctx,events)?;
        let(reference_schema,reference,reference_structure)=consume(resources.reference_schema,operation,ctx,events)?;
        let(package_schema,package,package_structure)=consume(resources.package_schema,operation,ctx,events)?;
        let constraints=resources.constraints.into_resource(operation,ctx)?;
        let domain_policy=resources.domain_policy.into_resource(operation,ctx)?;
        Self::publish_core(ResourceSet{core_schema,reference_schema,package_schema,constraints,domain_policy},[core,reference,package],[core_structure,reference_structure,package_structure],ctx,events)
    }
    #[cfg(not(all(feature = "metamodel-compiler", not(feature = "full-core"))))]
    pub(crate) fn mark_counted_owner(
        admitted: &mut AdmittedCore,
        _route: crate::canonical_codegen_resources::CountedBankRoute,
    ) {
        // The token is minted only for the exact fresh bank that consumed
        // the sealed fields. At this point no alias of the bank exists.
        let bank = Arc::get_mut(&mut admitted.bank).expect("fresh Core bank is uniquely held");
        if matches!(&bank.owner, Owner::Core(owner) if Arc::ptr_eq(owner, &admitted.resources)) {
            bank.owner = Owner::CountedCore(Arc::clone(&admitted.resources));
        }
    }

    pub(super) fn is_counted_core(&self) -> bool {
        matches!(&self.owner, Owner::CountedCore(_))
    }

    pub(crate) fn from_meta(tree:Arc<Value>,dialect:SchemaDialect,ctx:&mut Context<'_>)->Result<Arc<Self>,EngineError>{
        Self::from_meta_observed(tree,dialect,ctx,&mut BankEvents::default())
    }
    #[cfg(test)]
    fn from_meta_with_events(tree:Arc<Value>,dialect:SchemaDialect,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Arc<Self>,EngineError>{
        Self::from_meta_observed(tree,dialect,ctx,&mut BankEvents{observer:Some(observer),lifetime:std::marker::PhantomData})
    }
    fn from_meta_observed(tree:Arc<Value>,dialect:SchemaDialect,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<Arc<Self>,EngineError>{
        Self::from_meta_inner(tree,dialect,None,ctx,events)
    }
    pub(crate) fn from_completed_reader(parsed:Arc<crate::serialization::CompletedOwnedJson>,dialect:SchemaDialect,ctx:&mut Context<'_>)->Result<Arc<Self>,EngineError>{
        ctx.charge_work(1,Utf16::default())?;
        let tree=Arc::clone(parsed.value());
        Self::from_meta_inner(tree,dialect,Some(parsed),ctx,&mut BankEvents::default())
    }
    fn from_meta_inner(tree:Arc<Value>,dialect:SchemaDialect,parsed:Option<Arc<crate::serialization::CompletedOwnedJson>>,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<Arc<Self>,EngineError>{
        let missing=||EngineError::new("SCHEMA_INTERNAL",Utf16::default(),"Pinned metaschema resources are malformed");
        let meta_group=find(&tree,"metaschemas",ctx,events)?.ok_or_else(||EngineError::new("SCHEMA_INTERNAL",Utf16::default(),"Pinned metaschema data is malformed"))?;
        let name=match dialect {SchemaDialect::Draft3=>"Draft3Validator",SchemaDialect::Draft4=>"Draft4Validator",SchemaDialect::Draft6=>"Draft6Validator",SchemaDialect::Draft7=>"Draft7Validator",SchemaDialect::Draft2019_09=>"Draft201909Validator",SchemaDialect::Draft2020_12=>"Draft202012Validator"};
        let meta_root=find(indexed_field(&tree,meta_group),name,ctx,events)?.ok_or_else(||EngineError::new("SCHEMA_INTERNAL",Utf16::default(),"Pinned metaschema is missing"))?;
        let completed=match &parsed {Some(p)=>p.compatible(ctx)? && Arc::ptr_eq(p.value(),&tree),None=>false};
        // Only a completed same-lifetime parser receipt implies the stronger
        // CoreJSON profile of this actual selected immutable subtree. Otherwise
        // perform original selected-root admission BEFORE resource-ID projection.
        if !completed {schema_json_with_mode(indexed_field(indexed_field(&tree,meta_group),meta_root),ctx,false,false)?;}
        let meta_resources=find(&tree,"resources",ctx,events)?.ok_or_else(missing)?;
        let Value::Array(entries)=indexed_field(&tree,meta_resources)else{return Err(missing());};
        ctx.charge_work(entries.len().saturating_mul(std::mem::size_of::<Row>().div_ceil(std::mem::size_of::<usize>())).saturating_add(std::mem::size_of::<Self>().div_ceil(std::mem::size_of::<usize>())).saturating_add(3),Utf16::default())?;
        events.event("row-allocation");
        let mut rows=Vec::new();rows.try_reserve_exact(entries.len()).map_err(|_|missing())?;
        for(role,entry)in entries.iter().enumerate(){
            let id_member=find(entry,"id",ctx,events)?.ok_or_else(||EngineError::new("SCHEMA_INTERNAL",Utf16::default(),"Pinned metaschema resource has no id"))?;
            let Value::String(id)=indexed_field(entry,id_member)else{return Err(EngineError::new("SCHEMA_INTERNAL",Utf16::default(),"Pinned metaschema resource has no id"));};
            ctx.charge_work(id.len(),Utf16::default())?;
            events.event("projection-id");
            if id.to_utf8().is_err(){return Err(EngineError::new("SCHEMA_INTERNAL",Utf16::default(),"Pinned metaschema resource has no id"));}
            let schema_member=find(entry,"schema",ctx,events)?.ok_or_else(||EngineError::new("SCHEMA_INTERNAL",Utf16::default(),"Pinned metaschema resource has no schema"))?;
            if !completed {schema_json_with_mode(indexed_field(entry,schema_member),ctx,false,false)?;}
            ctx.charge_work(3,Utf16::default())?;events.event("projection-row");rows.push(Row{role,id_member,schema_member});
        }
        let lifetime=construction_lifetime(ctx)?;
        ctx.charge_work(1,Utf16::default())?;
        let parsed_owner=if completed{parsed}else{None};
        events.event("bank-publication");
        Ok(Arc::new(Self{owner:Owner::Meta(tree),rows,facts:Vec::new(),structures:Vec::new(),parsed_owner,limits:ctx.limits(),lifetime,meta_group,meta_root,meta_resources}))
    }
    pub(crate) fn structure_role(&self,role:BankRoot,ctx:&mut Context<'_>)->Result<Option<admitted_structure::View>,EngineError>{
        if !self.input_compatible(ctx)?{return Ok(None);}
        ctx.charge_work(3,Utf16::default())?;
        ctx.charge_work(1,Utf16::default())?; // actual Structure profile comparison
        match (&self.owner,role){
            (Owner::Core(_) | Owner::CountedCore(_),BankRoot::Core(index))=>Ok(self.structures.get(index).and_then(|s|s.as_ref()).filter(|s|s.compatible(ctx)).and_then(|s|s.root())),
            (Owner::Meta(_),BankRoot::Meta)=>{
                let Some(parsed)=&self.parsed_owner else{return Ok(None);};
                if !parsed.compatible(ctx)?{return Ok(None);}
                let Some(root)=parsed.structure().filter(|s|s.compatible(ctx)).and_then(|s|s.root())else{return Ok(None);};
                let Some(group)=admitted_structure::Structure::child(&root,self.meta_group,ctx)?else{return Ok(None);};
                admitted_structure::Structure::child(&group,self.meta_root,ctx)
            },_=>Ok(None),
        }
    }
    pub(crate) fn structure_catalogue(&self,index:usize,ctx:&mut Context<'_>)->Result<Option<admitted_structure::View>,EngineError>{
        if !self.input_compatible(ctx)?{return Ok(None);}
        ctx.charge_work(4,Utf16::default())?;
        let Some(row)=self.rows.get(index)else{return Ok(None);};
        match &self.owner{
            Owner::Core(_) | Owner::CountedCore(_)=>self.structure_role(BankRoot::Core(row.role),ctx),
            Owner::Meta(_)=>{
                let Some(parsed)=&self.parsed_owner else{return Ok(None);};
                if !parsed.compatible(ctx)?{return Ok(None);}
                ctx.charge_work(1,Utf16::default())?; // Structure profile comparison
                let Some(root)=parsed.structure().filter(|s|s.compatible(ctx)).and_then(|s|s.root())else{return Ok(None);};
                let Some(resources)=admitted_structure::Structure::child(&root,self.meta_resources,ctx)?else{return Ok(None);};
                let Some(entry)=admitted_structure::Structure::child(&resources,row.role,ctx)?else{return Ok(None);};
                admitted_structure::Structure::child(&entry,row.schema_member,ctx)
            },
        }
    }
    pub(crate) fn root(&self,role:BankRoot)->&Value {
        match(&self.owner,role){
            (Owner::Core(core) | Owner::CountedCore(core),BankRoot::Core(0))=>&core.core_schema,
            (Owner::Core(core) | Owner::CountedCore(core),BankRoot::Core(1))=>&core.reference_schema,
            (Owner::Core(core) | Owner::CountedCore(core),BankRoot::Core(2))=>&core.package_schema,
            (Owner::Meta(tree),BankRoot::Meta)=>indexed_field(indexed_field(tree,self.meta_group),self.meta_root),
            _=>panic!("private bank role was not admitted"),
        }
    }
    pub(crate) fn root_checked(&self,role:BankRoot)->Option<&Value> {
        match(&self.owner,role){(Owner::Core(_) | Owner::CountedCore(_),BankRoot::Core(i))if i<3=>Some(self.root(role)),(Owner::Meta(_),BankRoot::Meta)=>Some(self.root(role)),_=>None}
    }
    pub(crate) fn whole_metatree(&self)->Option<&Value>{match &self.owner{Owner::Meta(tree)=>Some(tree),_=>None}}
    pub(crate) fn len(&self)->usize {self.rows.len()}
    pub(crate) fn get(&self,index:usize)->Option<(&Utf16,&Value)> {
        let row=self.rows.get(index)?;
        match &self.owner {
            Owner::Core(_) | Owner::CountedCore(_)=>{let value=self.root(BankRoot::Core(row.role));match indexed_field(value,row.id_member){Value::String(id)=>Some((id,value)),_=>None}},
            Owner::Meta(tree)=>{let Value::Array(entries)=indexed_field(tree,self.meta_resources)else{return None;};let entry=entries.get(row.role)?;match indexed_field(entry,row.id_member){Value::String(id)=>Some((id,indexed_field(entry,row.schema_member))),_=>None}},
        }
    }
    pub(crate) fn owns_core(&self,resources:&Arc<ResourceSet>,ctx:&mut Context<'_>)->Result<bool,EngineError>{
        ctx.charge_work(3,Utf16::default())?;
        Ok(matches!(&self.owner,Owner::Core(owner) | Owner::CountedCore(owner) if Arc::ptr_eq(owner,resources)))
    }
    pub(crate) fn input_compatible(&self,ctx:&mut Context<'_>)->Result<bool,EngineError>{
        ctx.charge_work(3,Utf16::default())?;
        Ok(self.limits==ctx.limits()&&ctx.schema_construction.as_ref().is_some_and(|state|state.borrow().lifetime.as_ref().is_some_and(|token|Arc::ptr_eq(token,&self.lifetime))))
    }
    pub(crate) fn unique_retrievals(&self,ctx:&mut Context<'_>)->Result<bool,EngineError>{
        for i in 0..self.len(){for j in 0..i{
            ctx.charge_work(5,Utf16::default())?;
            let(a,_)=self.get(i).expect("admitted row");let(b,_)=self.get(j).expect("admitted row");
            if a.len()!=b.len(){continue;}
            let mut equal=true;
            for unit in 0..a.len(){ctx.charge_work(3,Utf16::default())?;if a.units()[unit]!=b.units()[unit]{equal=false;break;}}
            if equal{return Ok(false);}
        }}
        Ok(true)
    }
    pub(crate) fn anchor_free_core_role(&self,role:usize,ctx:&mut Context<'_>)->Result<bool,EngineError>{
        ctx.charge_work(3,Utf16::default())?;
        let Some(fact)=self.facts.get(role)else{return Ok(false);};
        let Some(member)=fact.root_id else{return Ok(false);};
        if !fact.anchor_free||fact.nested_id{return Ok(false);}
        let Value::String(id)=indexed_field(self.root(BankRoot::Core(role)),member)else{return Ok(false);};
        ctx.charge_work(id.len().saturating_mul(3).saturating_add(1),Utf16::default())?;
        Ok(id.units().contains(&58)&&id.units().iter().all(|u|*u<=127&&*u!=35))
    }
    pub(crate) fn snapshot(&self,ctx:&mut Context<'_>)->Result<SchemaResources,EngineError>{
        self.snapshot_observed(ctx,&mut BankEvents::default())
    }
    #[cfg(test)]
    fn snapshot_with_events(&self,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<SchemaResources,EngineError>{
        self.snapshot_observed(ctx,&mut BankEvents{observer:Some(observer),lifetime:std::marker::PhantomData})
    }
    fn snapshot_observed(&self,ctx:&mut Context<'_>,events:&mut BankEvents<'_>)->Result<SchemaResources,EngineError>{
        ctx.charge_work(self.len(),Utf16::default())?;
        events.event("snapshot-allocation");
        let mut entries=Vec::with_capacity(self.len());
        for i in 0..self.len(){let(id,v)=self.get(i).expect("admitted row");ctx.charge_work(id.clone_work(),Utf16::default())?;events.event("snapshot-row");entries.push((id.clone(),crate::copy_json(v,ctx)?));}
        events.event("snapshot-publication");
        Ok(SchemaResources{entries})
    }
}
#[derive(Clone,Copy)]
pub(super) enum Catalogue<'a> { Borrowed(&'a [(Utf16,Value)]), Bank(&'a SchemaBank), Codegen(&'a CodegenCatalogue) }
impl<'a> Catalogue<'a> {
    pub(super) fn len(self)->usize {match self{Self::Borrowed(v)=>v.len(),Self::Bank(b)=>b.len(),Self::Codegen(c)=>c.len()}}
    pub(super) fn get(self,i:usize)->Option<(&'a Utf16,&'a Value)> {match self{Self::Borrowed(v)=>v.get(i).map(|(id,v)|(id,v)),Self::Bank(b)=>b.get(i),Self::Codegen(c)=>c.get(i)}}
    // Only OC1 adds an owner/extension translation. Original borrowed/bank
    // access stays uncharged here; its existing callers keep original fees.
    pub(super) fn len_with_context(self,ctx:&mut Context<'_>)->Result<usize,EngineError>{
        if matches!(self,Self::Codegen(_)){ctx.charge_work(4,Utf16::default())?;}
        Ok(self.len())
    }
    pub(super) fn get_with_context(self,index:usize,ctx:&mut Context<'_>)->Result<Option<(&'a Utf16,&'a Value)>,EngineError>{
        if matches!(self,Self::Codegen(_)){ctx.charge_work(8,Utf16::default())?;}
        Ok(self.get(index))
    }
    pub(super) fn iter(self)->CatalogueIter<'a>{CatalogueIter{catalogue:self,index:0}}
}
pub(super) struct CatalogueIter<'a>{catalogue:Catalogue<'a>,index:usize}
impl<'a> Iterator for CatalogueIter<'a>{
    type Item=(&'a Utf16,&'a Value);
    fn next(&mut self)->Option<Self::Item>{let value=self.catalogue.get(self.index)?;self.index+=1;Some(value)}
    fn size_hint(&self)->(usize,Option<usize>){let remaining=self.catalogue.len().saturating_sub(self.index);(remaining,Some(remaining))}
}
impl<'a> IntoIterator for Catalogue<'a>{type Item=(&'a Utf16,&'a Value);type IntoIter=CatalogueIter<'a>;fn into_iter(self)->Self::IntoIter{self.iter()}}
impl<'a> IntoIterator for &Catalogue<'a>{type Item=(&'a Utf16,&'a Value);type IntoIter=CatalogueIter<'a>;fn into_iter(self)->Self::IntoIter{(*self).iter()}}

#[cfg(test)]
#[path="schema_admitted_bank_independent_tests.rs"]
mod independent_tests;

// Invocation-local custody: the bank borrow and resources View are created
// together here. No caller can substitute a bank or a physical parent. The
// immutable bank/parser/Structure remain alive throughout this lexical borrow.
// No cursor/frontier/index cache and no owned Limits snapshot are introduced.
pub(crate) struct ResourcesParent<'a> {
    bank: &'a SchemaBank,
    view: admitted_structure::View,
}
impl SchemaBank {
    pub(crate) fn resources_parent(&self,ctx:&mut Context<'_>)->Result<Option<ResourcesParent<'_>>,EngineError>{
        let words=|n:usize|n.div_ceil(std::mem::size_of::<usize>());
        // Prepay every new initialized representation/move: local+returned+
        // caller Option<Parent>, constructed+returned Parent, root/parent
        // Option<View> temporaries, and their two View payload transports.
        // Twelve scalar operations cover owner/parser/structure/option branches,
        // borrowed-bank binding, root Arc clone/drop, final parent Arc cleanup,
        // and successful publication/return. All are paid even on early refusal.
        ctx.charge_work(3*words(std::mem::size_of::<Option<ResourcesParent<'_>>>())
            +2*words(std::mem::size_of::<ResourcesParent<'_>>())
            +2*words(std::mem::size_of::<Option<admitted_structure::View>>())
            +2*words(std::mem::size_of::<admitted_structure::View>())+12,Utf16::default())?;
        if !self.input_compatible(ctx)?{return Ok(None);}
        let Owner::Meta(_)=&self.owner else{return Ok(None);};
        let Some(parsed)=&self.parsed_owner else{return Ok(None);};
        if !parsed.compatible(ctx)?{return Ok(None);}
        ctx.charge_work(1,Utf16::default())?;
        let Some(root)=parsed.structure().filter(|s|s.compatible(ctx)).and_then(|s|s.root())else{return Ok(None);};
        let Some(view)=admitted_structure::Structure::child(&root,self.meta_resources,ctx)?else{return Ok(None);};
        Ok(Some(ResourcesParent{bank:self,view}))
    }
}
impl ResourcesParent<'_> {
    pub(crate) fn select(&self,index:usize,ctx:&mut Context<'_>)->Result<Option<admitted_structure::View>,EngineError>{
        // The same original per-row dynamic checks, lookup order and tariffs.
        // The lexical immutable borrow replaces ONLY root->resources lookup.
        if !self.bank.input_compatible(ctx)?{return Ok(None);}
        ctx.charge_work(4,Utf16::default())?;
        let Some(row)=self.bank.rows.get(index)else{return Ok(None);};
        let Some(parsed)=&self.bank.parsed_owner else{return Ok(None);};
        if !parsed.compatible(ctx)?{return Ok(None);}
        ctx.charge_work(1,Utf16::default())?;
        if !self.view.structure.compatible(ctx){return Ok(None);}
        let Some(entry)=admitted_structure::Structure::child(&self.view,row.role,ctx)?else{return Ok(None);};
        admitted_structure::Structure::child(&entry,row.schema_member,ctx)
    }
}

// Private compile-time performance bound for the independently authenticated
// twenty-row catalogue geometry. It never selects a runtime route or changes
// acceptance/limits. The target compiler, not a guessed field layout, must prove
// the complete local model is strictly below the original 1000. No claim about
// whole-constructor cost, remaining work, stack footprint or allocator calls.
const _: () = {
    const fn words(bytes:usize)->usize{bytes.div_ceil(std::mem::size_of::<usize>())}
    assert!(872
        +3*words(std::mem::size_of::<Option<ResourcesParent<'static>>>())
        +2*words(std::mem::size_of::<ResourcesParent<'static>>())
        +2*words(std::mem::size_of::<Option<admitted_structure::View>>())
        +2*words(std::mem::size_of::<admitted_structure::View>()) < 1000);
};

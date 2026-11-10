// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private closed-producer metadata. No JSON/schema proof is minted here.
//! Only original validator/parser recursion supplies admitted counters/positions.
use super::*;
use std::marker::PhantomData;
type Brand<'r> = PhantomData<&'r mut &'r ()>;
#[derive(Default)]
enum Mode {#[default] Fresh, Compact, Checked(Traversal), Unavailable}
pub(crate) struct ClosedRoot<'r> {state:Option<State>,brand:Brand<'r>}
struct State {
    mode:Mode,rows:Vec<Option<Node>>,written:usize,
    limits:crate::context::Limits,profile:crate::context::ResourceProfile,roles:CoreRoleFacts,
}
struct Local {id:u32,parent:u32,edge:u32,depth:u32,max_depth:u32,flags:u8}
enum ContainerState {Compact(Local),Checked,Unavailable}
pub(crate) struct Container<'r> {state:ContainerState,brand:Brand<'r>}
enum SummaryState {Compact{max_depth:u32,flags:u8},Checked,Unavailable}
pub(crate) struct Summary<'r> {state:SummaryState,brand:Brand<'r>}
/// A fresh invariant lifetime prevents a container/summary escaping or being
/// substituted from an independently nested root. Fields/constructors private.
/// This crate-private graph is used only by the actual two complete producers.
pub(crate) fn with_root<T>(run:impl for<'r> FnOnce(ClosedRoot<'r>)->Result<T,EngineError>)->Result<T,EngineError>{
    run(ClosedRoot{state:None,brand:PhantomData})
}
impl<'r> ClosedRoot<'r> {
    fn guarded<T>(&mut self,run:impl FnOnce(&mut Self)->Result<T,EngineError>)->Result<T,EngineError>{
        struct Guard<'a,'r>{root:&'a mut ClosedRoot<'r>,success:bool}
        impl Drop for Guard<'_,'_>{fn drop(&mut self){if !self.success{if let Some(state)=&mut self.root.state{state.mode=Mode::Unavailable;}}}}
        let mut guard=Guard{root:self,success:false};let result=run(&mut *guard.root);guard.success=result.is_ok();result
    }
    fn start(&mut self,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        if self.state.is_none(){
            // Genuine collector state/header initialization is deferred until
            // original root admission. No speculative Vec/summary initialization.
            ctx.charge_work_with_path(std::mem::size_of::<State>().div_ceil(std::mem::size_of::<usize>()).saturating_add(std::mem::size_of::<crate::context::Limits>().div_ceil(std::mem::size_of::<usize>())).saturating_add(4),path)?;
            event("closed-compact-guard");
            let limits=ctx.limits();let profile=ctx.profile();
            let mode=if limits.max_values < NONE as usize {Mode::Compact}else{event("closed-checked-fallback");Mode::Checked(Traversal::default())};
            self.state=Some(State{mode,rows:Vec::new(),written:0,limits,profile,roles:CoreRoleFacts::default()});
        }
        Ok(())
    }
    // The original checked entry count is preorder ordinal+1. A successful
    // closed recursion emits one row before any child and one completion per
    // admitted node; unavailable collection is poisoned and cannot publish.
    // max_values<NONE bounds ordinal/end/count, and depth<=visited_nodes-1.
    // No per-node table search, heap frame, pointer identity or unchecked mint.
    pub(crate) fn scalar(&mut self,entry_count:usize,depth:usize,parent:Option<(&Container<'r>,usize)>,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Summary<'r>,EngineError>{
        self.guarded(|root|{
            root.start(ctx,path,event)?;
            let root=root.state.as_mut().expect("admitted root state");
            match &mut root.mode {
                Mode::Checked(state)=>{state.enter_with_observer(ctx,path,event)?;state.leave_with_observer(ctx,path,event)?;ctx.charge_work_with_path(1,path)?;event("closed-checked-token");return Ok(Summary{state:SummaryState::Checked,brand:PhantomData});},
                Mode::Unavailable=>return Ok(Summary{state:SummaryState::Unavailable,brand:PhantomData}),
                Mode::Compact=>{},Mode::Fresh=>unreachable!(),
            }
            // Entry subtraction +3 casts +parent read +end addition.
            ctx.charge_work_with_path(6,path)?;
            let id=(entry_count-1)as u32;let depth=depth as u32;
            let(parent,edge)=match parent{Some((p,edge))=>match &p.state{ContainerState::Compact(p)=>(p.id,edge as u32),_=>{root.mode=Mode::Unavailable;return Ok(Summary{state:SummaryState::Unavailable,brand:PhantomData});}},None=>(NONE,0)};
            let end=id+1;
            if !reserve(&mut root.rows,ctx,path,event,"closed-row-growth")?{root.mode=Mode::Unavailable;return Ok(Summary{state:SummaryState::Unavailable,brand:PhantomData});}
            // Full actual Some<Node> row write +completed-count add/store.
            ctx.charge_work_with_path(std::mem::size_of::<Node>().div_ceil(std::mem::size_of::<usize>()).saturating_add(3),path)?;
            event("closed-scalar-record");
            root.rows.push(Some(Node{parent,edge,first:0,count:0,depth,end,flags:0,max_depth:depth}));root.written+=1;
            // Actual compact summary return storage; no child/frame allocation.
            ctx.charge_work_with_path(std::mem::size_of::<SummaryState>().div_ceil(std::mem::size_of::<usize>()),path)?;
            Ok(Summary{state:SummaryState::Compact{max_depth:depth,flags:0},brand:PhantomData})
        })
    }
    pub(crate) fn container(&mut self,entry_count:usize,depth:usize,parent:Option<(&Container<'r>,usize)>,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Container<'r>,EngineError>{
        self.guarded(|root|{
            root.start(ctx,path,event)?;
            let root=root.state.as_mut().expect("admitted root state");
            match &mut root.mode {
                Mode::Checked(state)=>{state.enter_with_observer(ctx,path,event)?;ctx.charge_work_with_path(1,path)?;event("closed-checked-token");return Ok(Container{state:ContainerState::Checked,brand:PhantomData});},
                Mode::Unavailable=>return Ok(Container{state:ContainerState::Unavailable,brand:PhantomData}),
                Mode::Compact=>{},Mode::Fresh=>unreachable!(),
            }
            // Entry subtraction, ordinal/depth/edge casts and actual parent read.
            ctx.charge_work_with_path(5,path)?;
            let id=(entry_count-1)as u32;let depth=depth as u32;
            let(parent,edge)=match parent{Some((p,edge))=>match &p.state{ContainerState::Compact(p)=>(p.id,edge as u32),_=>{root.mode=Mode::Unavailable;return Ok(Container{state:ContainerState::Unavailable,brand:PhantomData});}},None=>(NONE,0)};
            if !reserve(&mut root.rows,ctx,path,event,"closed-row-growth")?{root.mode=Mode::Unavailable;return Ok(Container{state:ContainerState::Unavailable,brand:PhantomData});}
            ctx.charge_work_with_path(std::mem::size_of::<Local>().div_ceil(std::mem::size_of::<usize>()).saturating_add(1),path)?;
            event("closed-container-local");
            root.rows.push(None);
            Ok(Container{state:ContainerState::Compact(Local{id,parent,edge,depth,max_depth:depth,flags:0}),brand:PhantomData})
        })
    }
    pub(crate) fn member(&mut self,local:&mut Container<'r>,ordinal:usize,key:&Utf16,is_string:bool,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        self.guarded(|root|{
            let Some(root)=root.state.as_mut() else{return Ok(());};
            if let Mode::Checked(state)=&mut root.mode{return state.member_with_observer(ordinal,key,is_string,ctx,path,event);}
            if !matches!(root.mode,Mode::Compact){return Ok(());}
            ctx.charge_work_with_path(1,path)?;
            let word=match key.len(){2=>"id",3=>"$id",14=>"$dynamicAnchor",16=>"$recursiveAnchor",_=>return Ok(())};
            for(i,b)in word.bytes().enumerate(){ctx.charge_work_with_path(2,path)?;if key.units()[i]!=u16::from(b){return Ok(());}}
            ctx.charge_work_with_path(3,path)?;event("closed-member-facts");
            let ContainerState::Compact(local)=&mut local.state else{root.mode=Mode::Unavailable;return Ok(());};
            if word=="$dynamicAnchor"||word=="$recursiveAnchor"{root.roles.anchors=true;}
            if is_string&&(word=="id"||word=="$id"){local.flags|=1;if local.depth>0{root.roles.nested_id=true;}else if word=="$id"{root.roles.root_id=Some(ordinal);}}
            if is_string&&word=="$dynamicAnchor"{local.flags|=2;}Ok(())
        })
    }
    pub(crate) fn merge(&mut self,local:&mut Container<'r>,child:Summary<'r>,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        self.guarded(|root|{
            let Some(root)=root.state.as_mut() else{return Ok(());};
            if !matches!(root.mode,Mode::Compact){return Ok(());}
            // Actual max comparison/store +two descendant flag tests/OR stores.
            // No child-count increment/reconstruction: producer supplies real len.
            ctx.charge_work_with_path(6,path)?;event("closed-child-summary");
            let(ContainerState::Compact(parent),SummaryState::Compact{max_depth,flags})=(&mut local.state,child.state)else{root.mode=Mode::Unavailable;return Ok(());};
            parent.max_depth=parent.max_depth.max(max_depth);parent.flags|=if flags&5!=0{4}else{0};parent.flags|=if flags&10!=0{8}else{0};Ok(())
        })
    }
    pub(crate) fn finish(&mut self,local:Container<'r>,accepted_count:usize,end_count:usize,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Summary<'r>,EngineError>{
        self.guarded(|root|{
            let Some(root)=root.state.as_mut() else{return Ok(Summary{state:SummaryState::Unavailable,brand:PhantomData});};
            if let Mode::Checked(state)=&mut root.mode{state.leave_with_observer(ctx,path,event)?;ctx.charge_work_with_path(1,path)?;event("closed-checked-token");return Ok(Summary{state:SummaryState::Checked,brand:PhantomData});}
            if !matches!(root.mode,Mode::Compact){return Ok(Summary{state:SummaryState::Unavailable,brand:PhantomData});}
            // End/count casts and real first-child arithmetic. Parent/count/depth
            // have not been reconstructed by reading any row or heap stack.
            ctx.charge_work_with_path(3,path)?;
            let ContainerState::Compact(local)=local.state else{root.mode=Mode::Unavailable;return Ok(Summary{state:SummaryState::Unavailable,brand:PhantomData});};
            let count=accepted_count as u32;let end=end_count as u32;let first=if count==0{0}else{local.id+1};
            ctx.charge_work_with_path(std::mem::size_of::<Node>().div_ceil(std::mem::size_of::<usize>()).saturating_add(3),path)?;
            event("closed-container-record");
            root.rows[local.id as usize]=Some(Node{parent:local.parent,edge:local.edge,first,count,depth:local.depth,end,flags:local.flags,max_depth:local.max_depth});root.written+=1;
            ctx.charge_work_with_path(std::mem::size_of::<SummaryState>().div_ceil(std::mem::size_of::<usize>()),path)?;
            Ok(Summary{state:SummaryState::Compact{max_depth:local.max_depth,flags:local.flags},brand:PhantomData})
        })
    }
    pub(crate) fn complete(mut self,final_count:usize,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Option<Arc<Structure>>,EngineError>{
        let Some(mut state)=self.state.take()else{return Ok(None);};
        match std::mem::replace(&mut state.mode,Mode::Unavailable){Mode::Checked(checked)=>return checked.complete_with_observer(ctx,event),Mode::Compact=>{},Mode::Fresh|Mode::Unavailable=>return Ok(None)}
        // Counter-slot correspondence and all completed stores checked once;
        // full effective limits/profile retained, never clamp custom bounds.
        ctx.charge_work(std::mem::size_of::<crate::context::Limits>().div_ceil(std::mem::size_of::<usize>()).saturating_add(5),Utf16::default())?;
        if state.limits!=ctx.limits()||state.profile!=ctx.profile()||state.written!=final_count||state.rows.len()!=final_count{return Ok(None);}
        ctx.charge_work(std::mem::size_of::<Structure>().div_ceil(std::mem::size_of::<usize>()).saturating_add(2),Utf16::default())?;
        event("closed-structure-publication");
        Ok(Some(Arc::new(Structure{records:Records::Framed(state.rows),limits:ctx.limits(),profile:ctx.profile(),core_role:Some(state.roles)})))
    }
}

#[cfg(test)]
#[path="schema_closed_container_independent_tests.rs"]
mod closed_container_independent_tests;

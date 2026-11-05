// SPDX-License-Identifier: MIT OR Apache-2.0
//! Structural coordinates collected while the private owner is actually admitted.
//! Neither these coordinates nor JSON validity establish schema validity.
use super::*;
const NONE:u32=u32::MAX;
#[derive(Debug)]
pub(crate) struct Node {
    pub(crate) parent:u32,pub(crate) edge:u32,pub(crate) first:u32,
    pub(crate) count:u32,pub(crate) depth:u32,pub(crate) end:u32,
    pub(crate) flags:u8,
    pub(crate) max_depth:u32,
}
#[derive(Debug)]
pub(crate) struct Structure {records:Records,limits:crate::context::Limits,profile:crate::context::ResourceProfile,core_role:Option<CoreRoleFacts>}
#[derive(Debug)]
enum Records {Generic(Vec<Node>),Framed(Vec<Option<Node>>)}
#[derive(Debug,Default)]
pub(crate) struct CoreRoleFacts {pub(crate) root_id:Option<usize>,pub(crate) nested_id:bool,pub(crate) anchors:bool}
#[derive(Clone,Debug)]
pub(crate) struct View {pub(crate) structure:Arc<Structure>,pub(crate) root:usize}
#[derive(Default)]
pub(crate) struct Builder {nodes:Vec<Node>,stack:Vec<usize>,unavailable:bool}
fn reserve<T>(v:&mut Vec<T>,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str),label:&'static str)->Result<bool,EngineError>{
    if v.len()<v.capacity(){return Ok(true);}
    let wanted=v.capacity().checked_mul(2).unwrap_or(usize::MAX).max(1);
    let words=std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>());
    ctx.charge_work_with_path(v.len().saturating_add(wanted).saturating_mul(words),path)?;
    event(label);
    Ok(v.try_reserve_exact(wanted-v.len()).is_ok())
}
impl Builder {
    // A caught control failure or observer unwind must never let a partial
    // record collection become a later reusable Structure. Cleanup only marks
    // poison: it never calls controls or reconstructs a consumed error path.
    fn guarded<T>(&mut self,run:impl FnOnce(&mut Self)->Result<T,EngineError>)->Result<T,EngineError>{
        struct Guard<'s>{builder:&'s mut Builder,success:bool}
        impl Drop for Guard<'_>{fn drop(&mut self){if !self.success{self.builder.unavailable=true;}}}
        let mut guard=Guard{builder:self,success:false};
        let result=run(&mut *guard.builder);guard.success=result.is_ok();result
    }
    pub(crate) fn disabled()->Self{Self{unavailable:true,..Default::default()}}
    pub(crate) fn enter(&mut self,depth:usize,ctx:&mut Context<'_>,path:&mut Utf16)->Result<(),EngineError>{
        self.guarded(|builder|builder.enter_impl(depth,ctx,path,&mut |_|{}))
    }
    #[cfg(test)]
    pub(crate) fn enter_with_events(&mut self,depth:usize,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{self.guarded(|builder|builder.enter_impl(depth,ctx,path,event))}
    fn enter_impl(&mut self,depth:usize,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        if self.unavailable{return Ok(());}
        ctx.charge_work_with_path(6,path)?;
        // Additional real count/depth/parent checks and summary initialization.
        // The original six metadata charges are retained, never discounted.
        ctx.charge_work_with_path(4,path)?;
        let parent=self.stack.last().copied();
        if self.nodes.len()>=ctx.limits().max_values || depth>ctx.limits().max_depth
            || match parent {Some(p)=>self.nodes[p].depth.checked_add(1).map(|d|d as usize)!=Some(depth),None=>depth!=0}
        {self.unavailable=true;return Ok(());}
        let edge=parent.map(|p|self.nodes[p].count).unwrap_or(0);
        let Some(index)=u32::try_from(self.nodes.len()).ok().filter(|i|*i<NONE)else{self.unavailable=true;return Ok(());};
        let Ok(depth)=u32::try_from(depth)else{self.unavailable=true;return Ok(());};
        if !reserve(&mut self.nodes,ctx,path,event,"node-growth")? || !reserve(&mut self.stack,ctx,path,event,"stack-growth")? {self.unavailable=true;return Ok(());}
        event("node-store");
        self.nodes.push(Node{parent:parent.map(|p|p as u32).unwrap_or(NONE),edge,first:0,count:0,depth,end:0,flags:0,max_depth:depth});
        if let Some(p)=parent {let Some(count)=self.nodes[p].count.checked_add(1)else{self.unavailable=true;return Ok(());};self.nodes[p].count=count;if count==1{self.nodes[p].first=index;}}
        self.stack.push(index as usize);Ok(())
    }
    pub(crate) fn member(&mut self,key:&Utf16,is_string:bool,ctx:&mut Context<'_>,path:&mut Utf16)->Result<(),EngineError>{
        self.guarded(|builder|builder.member_impl(key,is_string,ctx,path))
    }
    fn member_impl(&mut self,key:&Utf16,is_string:bool,ctx:&mut Context<'_>,path:&mut Utf16)->Result<(),EngineError>{
        if self.unavailable{return Ok(());}
        ctx.charge_work_with_path(1,path)?;
        let word=match key.len(){2=>"id",3=>"$id",14=>"$dynamicAnchor",_=>return Ok(())};
        ctx.charge_work_with_path(1,path)?;
        if !is_string{return Ok(());}
        for (i,b)in word.bytes().enumerate(){ctx.charge_work_with_path(2,path)?;if key.units()[i]!=u16::from(b){return Ok(());}}
        let node=*self.stack.last().expect("member belongs to entered object");
        self.nodes[node].flags|=if word=="$dynamicAnchor"{2}else{1};Ok(())
    }
    pub(crate) fn leave(&mut self,ctx:&mut Context<'_>,path:&mut Utf16)->Result<(),EngineError>{
        self.guarded(|builder|builder.leave_impl(ctx,path,&mut |_|{}))
    }
    #[cfg(test)]
    pub(crate) fn leave_with_events(&mut self,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{self.guarded(|builder|builder.leave_impl(ctx,path,event))}
    fn leave_impl(&mut self,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        if self.unavailable{return Ok(());}
        ctx.charge_work_with_path(3,path)?;
        let Ok(end)=u32::try_from(self.nodes.len())else{self.unavailable=true;return Ok(());};
        event("subtree-complete");
        let node=self.stack.pop().expect("balanced first traversal");self.nodes[node].end=end;
        if let Some(parent)=self.stack.last().copied(){
            ctx.charge_work_with_path(2,path)?;
            event("summary-merge");
            self.nodes[parent].max_depth=self.nodes[parent].max_depth.max(self.nodes[node].max_depth);
            let flags=self.nodes[node].flags;self.nodes[parent].flags|=if flags&5!=0{4}else{0};self.nodes[parent].flags|=if flags&10!=0{8}else{0};}
        Ok(())
    }
    pub(crate) fn complete(self,ctx:&mut Context<'_>)->Result<Option<Arc<Structure>>,EngineError>{
        self.complete_impl(ctx,&mut |_|{})
    }
    #[cfg(test)]
    pub(crate) fn complete_with_events(self,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Option<Arc<Structure>>,EngineError>{self.complete_impl(ctx,event)}
    fn complete_impl(self,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Option<Arc<Structure>>,EngineError>{
        if self.unavailable || !self.stack.is_empty(){return Ok(None);}
        ctx.charge_work(std::mem::size_of::<Structure>().div_ceil(std::mem::size_of::<usize>()).saturating_add(2),Utf16::default())?;
        event("structure-publication");
        Ok(Some(Arc::new(Structure{records:Records::Generic(self.nodes),limits:ctx.limits(),profile:ctx.profile(),core_role:None})))
    }
}
impl Structure {
    pub(crate) fn extent(&self)->usize{match &self.records{Records::Generic(v)=>v.len(),Records::Framed(v)=>v.len()}}
    pub(crate) fn node(&self,index:usize)->Option<&Node>{match &self.records{Records::Generic(v)=>v.get(index),Records::Framed(v)=>v.get(index).and_then(Option::as_ref)}}
    pub(crate) fn core_role_facts(&self)->Option<&CoreRoleFacts>{self.core_role.as_ref()}
    pub(crate) fn compatible(&self,ctx:&Context<'_>)->bool{self.limits==ctx.limits()&&self.profile==ctx.profile()}
    pub(crate) fn root(self:&Arc<Self>)->Option<View>{self.node(0).map(|_|View{structure:Arc::clone(self),root:0})}
    pub(crate) fn child(view:&View,ordinal:usize,ctx:&mut Context<'_>)->Result<Option<View>,EngineError>{
        ctx.charge_work(4,Utf16::default())?;
        let Some(node)=view.structure.node(view.root)else{return Ok(None);};
        if ordinal>=node.count as usize{return Ok(None);}
        let mut child=node.first as usize;
        for skipped in 0..ordinal {ctx.charge_work(2,Utf16::default())?;ordered_structure_event("ow1-original-extent-advance",view.root,skipped,child);let Some(row)=view.structure.node(child)else{return Ok(None);};child=row.end as usize;}
        ordered_structure_event("ow1-original-selected-read",view.root,ordinal,child);
        let Some(row)=view.structure.node(child)else{return Ok(None);};
        if row.parent as usize!=view.root || row.edge as usize!=ordinal{return Ok(None);}
        Ok(Some(View{structure:Arc::clone(&view.structure),root:child}))
    }
}

// Actual invocation DFS state for trusted typed validation/private parsing.
// Generic Builder's arbitrary-input checks and 6/4/3/2 operations stay intact.
#[derive(Debug)]
struct Frame {ordinal:u32,parent:u32,edge:u32,depth:u32,count:u32,max_depth:u32,flags:u8}
#[derive(Default)]
pub(crate) struct Traversal {
    slots:Vec<Option<Node>>,frames:Vec<Frame>,written:usize,
    unavailable:bool,roles:CoreRoleFacts,
}
impl Traversal {
    fn guarded<T>(&mut self,run:impl FnOnce(&mut Self)->Result<T,EngineError>)->Result<T,EngineError>{
        struct Guard<'s>{state:&'s mut Traversal,success:bool}
        impl Drop for Guard<'_>{fn drop(&mut self){if !self.success{self.state.unavailable=true;}}}
        let mut guard=Guard{state:self,success:false};let result=run(&mut *guard.state);guard.success=result.is_ok();result
    }
    pub(crate) fn enter(&mut self,ctx:&mut Context<'_>,path:&mut Utf16)->Result<(),EngineError>{self.enter_with_observer(ctx,path,&mut |_|{})}
    #[cfg(test)]
    pub(crate) fn enter_with_events(&mut self,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{self.enter_with_observer(ctx,path,event)}
    pub(crate) fn enter_with_observer(&mut self,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        self.guarded(|state|{
            if state.unavailable{return Ok(());}
            // Ordinal/depth casts and current frame parent/edge reads. No
            // descriptor-table parent/depth reload or duplicate JSON bound check.
            ctx.charge_work_with_path(4,path)?;
            let Some(ordinal)=u32::try_from(state.slots.len()).ok().filter(|n|*n<NONE)else{state.unavailable=true;return Ok(());};
            let Ok(depth)=u32::try_from(state.frames.len())else{state.unavailable=true;return Ok(());};
            let(parent,edge)=state.frames.last().map(|f|(f.ordinal,f.count)).unwrap_or((NONE,0));
            if !reserve(&mut state.slots,ctx,path,event,"dfs-slot-growth")? || !reserve(&mut state.frames,ctx,path,event,"dfs-frame-growth")? {state.unavailable=true;return Ok(());}
            ctx.charge_work_with_path(std::mem::size_of::<Frame>().div_ceil(std::mem::size_of::<usize>()).saturating_add(1),path)?;
            event("dfs-frame-enter");
            state.slots.push(None);
            state.frames.push(Frame{ordinal,parent,edge,depth,count:0,max_depth:depth,flags:0});Ok(())
        })
    }
    pub(crate) fn member(&mut self,ordinal:usize,key:&Utf16,is_string:bool,ctx:&mut Context<'_>,path:&mut Utf16)->Result<(),EngineError>{self.member_with_observer(ordinal,key,is_string,ctx,path,&mut |_|{})}
    #[cfg(test)]
    pub(crate) fn member_with_events(&mut self,ordinal:usize,key:&Utf16,is_string:bool,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{self.member_with_observer(ordinal,key,is_string,ctx,path,event)}
    pub(crate) fn member_with_observer(&mut self,ordinal:usize,key:&Utf16,is_string:bool,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        self.guarded(|state|{
            if state.unavailable{return Ok(());}
            ctx.charge_work_with_path(1,path)?;
            let word=match key.len(){2=>"id",3=>"$id",14=>"$dynamicAnchor",16=>"$recursiveAnchor",_=>return Ok(())};
            for(i,b)in word.bytes().enumerate(){ctx.charge_work_with_path(2,path)?;if key.units()[i]!=u16::from(b){return Ok(());}}
            ctx.charge_work_with_path(3,path)?;
            event("dfs-member-facts");
            let frame=state.frames.last_mut().expect("real member belongs to active frame");
            if word=="$dynamicAnchor"||word=="$recursiveAnchor"{state.roles.anchors=true;}
            if is_string&&(word=="id"||word=="$id"){
                frame.flags|=1;if frame.depth>0{state.roles.nested_id=true;}else if word=="$id"{state.roles.root_id=Some(ordinal);}
            }
            if is_string&&word=="$dynamicAnchor"{frame.flags|=2;}Ok(())
        })
    }
    pub(crate) fn leave(&mut self,ctx:&mut Context<'_>,path:&mut Utf16)->Result<(),EngineError>{self.leave_with_observer(ctx,path,&mut |_|{})}
    #[cfg(test)]
    pub(crate) fn leave_with_events(&mut self,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{self.leave_with_observer(ctx,path,event)}
    pub(crate) fn leave_with_observer(&mut self,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        self.guarded(|state|{
            if state.unavailable{return Ok(());}
            ctx.charge_work_with_path(3,path)?;
            let Ok(end)=u32::try_from(state.slots.len())else{state.unavailable=true;return Ok(());};
            let frame=state.frames.pop().expect("balanced actual DFS return");
            let Some(first)=(if frame.count==0{Some(0)}else{frame.ordinal.checked_add(1)})else{state.unavailable=true;return Ok(());};
            // One final checked record write; no initialized descriptor gets
            // loaded/patched repeatedly to recover live traversal summaries.
            ctx.charge_work_with_path(std::mem::size_of::<Node>().div_ceil(std::mem::size_of::<usize>()).saturating_add(1),path)?;
            event("dfs-record-complete");
            state.slots[frame.ordinal as usize]=Some(Node{parent:frame.parent,edge:frame.edge,first,count:frame.count,depth:frame.depth,end,flags:frame.flags,max_depth:frame.max_depth});
            state.written=state.written.checked_add(1).expect("completed count bounded by slot ordinal");
            if !state.frames.is_empty(){
                ctx.charge_work_with_path(8,path)?;
                event("dfs-child-return");
                let parent=state.frames.last_mut().expect("active caller frame");
                let Some(count)=parent.count.checked_add(1)else{state.unavailable=true;return Ok(());};
                parent.count=count;parent.max_depth=parent.max_depth.max(frame.max_depth);
                parent.flags|=if frame.flags&5!=0{4}else{0};parent.flags|=if frame.flags&10!=0{8}else{0};
            }
            Ok(())
        })
    }
    pub(crate) fn complete(self,ctx:&mut Context<'_>)->Result<Option<Arc<Structure>>,EngineError>{self.complete_with_observer(ctx,&mut |_|{})}
    #[cfg(test)]
    pub(crate) fn complete_with_events(self,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Option<Arc<Structure>>,EngineError>{self.complete_with_observer(ctx,event)}
    pub(crate) fn complete_with_observer(self,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Option<Arc<Structure>>,EngineError>{
        if self.unavailable{return Ok(None);}
        ctx.charge_work(2,Utf16::default())?;
        if !self.frames.is_empty()||self.written!=self.slots.len(){return Ok(None);}
        ctx.charge_work(std::mem::size_of::<Structure>().div_ceil(std::mem::size_of::<usize>()).saturating_add(2),Utf16::default())?;
        event("dfs-structure-publication");
        Ok(Some(Arc::new(Structure{records:Records::Framed(self.slots),limits:ctx.limits(),profile:ctx.profile(),core_role:Some(self.roles)})))
    }
}

#[cfg(test)]
#[path="schema_fused_dfs_independent_tests.rs"]
mod fused_dfs_independent_tests;

#[path="schema_closed_structure.rs"]
pub(crate) mod closed;

// OW1: an invocation-local ordered physical walk, never a JSON/schema proof.
// Fields are private; the actual immutable parent is read by this constructor.
pub(crate) struct OrderedStructureChildren<'a> {
    structure: &'a Structure, parent: usize, parent_end:usize, count: usize,
    next_edge: usize, next_node: usize,
    limits: crate::context::Limits, profile: crate::context::ResourceProfile,
    valid: bool,
}
fn ordered_words<T>() -> usize { std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>()) }
impl Structure {
    pub(crate) fn ordered_children<'a>(&'a self, parent: usize, ctx: &mut Context<'_>) -> Result<Option<OrderedStructureChildren<'a>>, EngineError> {
        ctx.charge_work(ordered_words::<OrderedStructureChildren<'a>>() + ordered_words::<crate::context::Limits>() + 12, Utf16::default())?;
        if !self.compatible(ctx) { return Ok(None); }
        let Some(node)=self.node(parent) else { return Ok(None); };
        if parent>=ctx.limits().max_values || node.depth as usize>ctx.limits().max_depth || node.end as usize>self.extent() { return Ok(None); }
        Ok(Some(OrderedStructureChildren{structure:self,parent,parent_end:node.end as usize,count:node.count as usize,next_edge:0,next_node:node.first as usize,limits:ctx.limits(),profile:ctx.profile(),valid:true}))
    }
}
impl OrderedStructureChildren<'_> {
    pub(crate) fn select(&mut self, edge: usize, ctx: &mut Context<'_>) -> Result<Option<usize>, EngineError> {
        struct Guard<'s,'a>{state:&'s mut OrderedStructureChildren<'a>,success:bool}
        impl Drop for Guard<'_,'_>{fn drop(&mut self){if !self.success{self.state.valid=false;}}}
        let mut guard=Guard{state:self,success:false};let result=guard.state.select_impl(edge,ctx);guard.success=result.is_ok();result
    }
    fn select_impl(&mut self, edge: usize, ctx: &mut Context<'_>) -> Result<Option<usize>, EngineError> {
        if !self.valid {return Ok(None);}
        ctx.charge_work(ordered_words::<crate::context::Limits>() + 12, Utf16::default())?;
        if !self.valid || self.limits!=ctx.limits() || self.profile!=ctx.profile() || edge<self.next_edge || edge>=self.count { return Ok(None); }
        let mut ordinal=self.next_edge; let mut physical=self.next_node;
        while ordinal<edge {
            ctx.charge_work(6,Utf16::default())?;
            ordered_structure_event("ow1-ordered-extent-read",self.parent,ordinal,physical);
            let Some(row)=self.structure.node(physical) else { return Ok(None); };
            if row.parent as usize!=self.parent || row.edge as usize!=ordinal || row.end as usize<=physical || row.end as usize>self.parent_end { return Ok(None); }
            ordered_structure_event("ow1-ordered-extent-advance",self.parent,ordinal,physical);
            physical=row.end as usize; ordinal+=1;
        }
        ctx.charge_work(ordered_words::<Self>() + 12,Utf16::default())?;
        ordered_structure_event("ow1-ordered-selected-read",self.parent,edge,physical);
        let Some(row)=self.structure.node(physical) else { return Ok(None); };
        if row.parent as usize!=self.parent || row.edge as usize!=edge || row.end as usize<=physical || row.end as usize>self.parent_end || self.limits!=ctx.limits() || self.profile!=ctx.profile() { return Ok(None); }
        // No state is published across a control call or before the final debit.
        ordered_structure_event("ow1-ordered-frontier-commit",self.parent,edge,physical);
        self.next_edge=edge+1; self.next_node=row.end as usize;
        Ok(Some(physical))
    }
}

// Read-only cfg observation of actual physical rows. parent/edge/row are
// physical metadata, not logical role identity or admission evidence.
#[cfg(test)]
thread_local!{static ORDERED_STRUCTURE_OBSERVER:std::cell::RefCell<Option<Box<dyn FnMut(&'static str,usize,usize,usize)>>>=std::cell::RefCell::new(None);}
#[cfg(test)]
pub(crate) fn observe_ordered_structure<T>(observer:Box<dyn FnMut(&'static str,usize,usize,usize)>,operation:impl FnOnce()->T)->T{
    struct Restore(Option<Box<dyn FnMut(&'static str,usize,usize,usize)>>);
    impl Drop for Restore{fn drop(&mut self){ORDERED_STRUCTURE_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
    let prior=ORDERED_STRUCTURE_OBSERVER.with(|s|s.borrow_mut().replace(observer));let _restore=Restore(prior);operation()
}
fn ordered_structure_event(event:&'static str,parent:usize,edge:usize,row:usize){
    #[cfg(test)]
    {let observer=ORDERED_STRUCTURE_OBSERVER.with(|s|s.borrow_mut().take());if let Some(observer)=observer{
        struct Restore(Option<Box<dyn FnMut(&'static str,usize,usize,usize)>>);
        impl Drop for Restore{fn drop(&mut self){ORDERED_STRUCTURE_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
        let mut restore=Restore(Some(observer));if let Some(observer)=restore.0.as_mut(){observer(event,parent,edge,row);}
    }}
    #[cfg(not(test))]let _=(event,parent,edge,row);
}

// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private parser specialization. Ordinary associated locals/returns are unit.
use super::*;
use crate::schema::admitted_structure::{closed,Structure};
pub(super) trait ParserMetadata {
    type Node;type Summary;
    fn scalar(&mut self,count:usize,depth:usize,parent:Option<(&Self::Node,usize)>,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Self::Summary,EngineError>;
    fn container(&mut self,count:usize,depth:usize,parent:Option<(&Self::Node,usize)>,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Self::Node,EngineError>;
    fn member(&mut self,node:&mut Self::Node,ordinal:usize,key:&Utf16,is_string:bool,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>;
    fn merge(&mut self,node:&mut Self::Node,child:Self::Summary,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>;
    fn finish(&mut self,node:Self::Node,accepted:usize,end_count:usize,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Self::Summary,EngineError>;
    fn complete(&mut self,count:usize,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Option<std::sync::Arc<Structure>>,EngineError>;
}
pub(super) struct NoMetadata;
impl ParserMetadata for NoMetadata {
    type Node=();type Summary=();
    fn scalar(&mut self,_:usize,_:usize,_:Option<(&(),usize)>,_:&mut Context<'_>,_:&mut Utf16,_:&mut dyn FnMut(&'static str))->Result<(),EngineError>{Ok(())}
    fn container(&mut self,_:usize,_:usize,_:Option<(&(),usize)>,_:&mut Context<'_>,_:&mut Utf16,_:&mut dyn FnMut(&'static str))->Result<(),EngineError>{Ok(())}
    fn member(&mut self,_:&mut (),_:usize,_:&Utf16,_:bool,_:&mut Context<'_>,_:&mut Utf16,_:&mut dyn FnMut(&'static str))->Result<(),EngineError>{Ok(())}
    fn merge(&mut self,_:&mut (),_:(),_:&mut Context<'_>,_:&mut Utf16,_:&mut dyn FnMut(&'static str))->Result<(),EngineError>{Ok(())}
    fn finish(&mut self,_:(),_:usize,_:usize,_:&mut Context<'_>,_:&mut Utf16,_:&mut dyn FnMut(&'static str))->Result<(),EngineError>{Ok(())}
    fn complete(&mut self,_:usize,_:&mut Context<'_>,_:&mut dyn FnMut(&'static str))->Result<Option<std::sync::Arc<Structure>>,EngineError>{Ok(None)}
}
pub(super) struct ClosedMetadata<'r> {pub(super) root:Option<closed::ClosedRoot<'r>>}
impl<'r> ParserMetadata for ClosedMetadata<'r> {
    type Node=closed::Container<'r>;type Summary=closed::Summary<'r>;
    fn scalar(&mut self,count:usize,depth:usize,parent:Option<(&Self::Node,usize)>,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Self::Summary,EngineError>{self.root.as_mut().expect("active private parser").scalar(count,depth,parent,ctx,path,event)}
    fn container(&mut self,count:usize,depth:usize,parent:Option<(&Self::Node,usize)>,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Self::Node,EngineError>{self.root.as_mut().expect("active private parser").container(count,depth,parent,ctx,path,event)}
    fn member(&mut self,node:&mut Self::Node,ordinal:usize,key:&Utf16,is_string:bool,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{self.root.as_mut().expect("active private parser").member(node,ordinal,key,is_string,ctx,path,event)}
    fn merge(&mut self,node:&mut Self::Node,child:Self::Summary,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{self.root.as_mut().expect("active private parser").merge(node,child,ctx,path,event)}
    fn finish(&mut self,node:Self::Node,accepted:usize,end_count:usize,ctx:&mut Context<'_>,path:&mut Utf16,event:&mut dyn FnMut(&'static str))->Result<Self::Summary,EngineError>{self.root.as_mut().expect("active private parser").finish(node,accepted,end_count,ctx,path,event)}
    fn complete(&mut self,count:usize,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Option<std::sync::Arc<Structure>>,EngineError>{match self.root.take(){Some(root)=>root.complete(count,ctx,event),None=>Ok(None)}}
}

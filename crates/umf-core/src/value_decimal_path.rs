// SPDX-License-Identifier: MIT OR Apache-2.0
//! Core-private direct decimal append. No resource/profile proof is minted.
use super::{Context,EngineError,TextStorage,Utf16};

pub(crate) fn append_decimal_index(path:&mut Utf16,index:usize,ctx:&mut Context<'_>)->Result<usize,EngineError>{
    append_decimal_index_impl(path,index,ctx,&mut |_|{})
}
#[cfg(test)]
pub(crate) fn append_decimal_index_with_events(path:&mut Utf16,index:usize,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<usize,EngineError>{
    append_decimal_index_impl(path,index,ctx,event)
}
fn append_decimal_index_impl(path:&mut Utf16,index:usize,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<usize,EngineError>{
    // Read len/storage/capacity(3); initialize probe/divisor/digits(3), and
    // reserve the two scalar emission-local copies performed after admission(2).
    ctx.charge_work_with_path(8,path)?;
    event("decimal-state");
    let old=path.len();
    let capacity=match &path.0{TextStorage::Owned(v)=>v.capacity(),TextStorage::Shared(_)|TextStorage::Static(_)=>0};
    let mut probe=index;let mut divisor=1usize;let mut digits=1usize;
    // Every usize, including zero, emits at least one digit. Per actual digit:
    // quotient, cast, remainder, ASCII add, store, final-place compare(6).
    // Non-final divisor updates(d-1) +slash store(1) make EXACTLY7*d.
    // Pay these seven operations incrementally; there is no runtime fee-multiply
    // or scratch digit array to initialize, allocate, copy or reverse.
    ctx.charge_work_with_path(7,path)?;
    event("decimal-digit-credit");
    loop {
        ctx.charge_work_with_path(1,path)?;
        event("decimal-count-compare");
        if probe<10{break;}
        // Divide probe, checked divisor multiply+overflow branch, digit add(4)
        // plus the guaranteed next digit's seven emission operations.
        ctx.charge_work_with_path(11,path)?;
        event("decimal-count-step");
        probe/=10;
        divisor=divisor.checked_mul(10).ok_or_else(||EngineError::new("LIMIT",std::mem::take(path),"Decimal path divisor overflow"))?;
        digits+=1;
    }
    // Suffix and full extent additions, with BOTH overflow branches(4).
    ctx.charge_work_with_path(4,path)?;
    event("decimal-extent");
    let suffix=digits.checked_add(1).ok_or_else(||EngineError::new("LIMIT",std::mem::take(path),"Owned decimal path size overflow"))?;
    let wanted=old.checked_add(suffix).ok_or_else(||EngineError::new("LIMIT",std::mem::take(path),"Owned decimal path size overflow"))?;
    ctx.charge_work_with_path(1,path)?;
    event("decimal-capacity-check");
    if wanted>capacity {
        // Capacity multiply, overflow selection, max selection and fee add(4).
        ctx.charge_work_with_path(4,path)?;
        event("decimal-growth-plan");
        let requested=capacity.checked_mul(2).unwrap_or(usize::MAX).max(wanted);
        let growth=old.saturating_add(requested);
        ctx.charge_work_with_path(growth,path)?;
        event("decimal-growth");
        let mut next=Vec::new();
        next.try_reserve_exact(requested).map_err(|_|EngineError::new("LIMIT",std::mem::take(path),"Owned decimal path allocation unavailable"))?;
        event("decimal-relocation");
        next.extend_from_slice(path.units());
        path.0=TextStorage::Owned(next);
    }
    // ALL emission arithmetic/stores were admitted above. No mutable storage
    // borrow, temporary take or shared-state lock spans any control callback.
    // This event is after the full admission set, not a fake one-debit marker.
    event("decimal-append");
    let mut remaining=index;let mut place=divisor;
    let TextStorage::Owned(units)=&mut path.0 else{unreachable!("shared path's zero mutable capacity requires admitted detach")};
    units.push(0x2f);
    loop {
        let digit=(remaining/place)as u16;
        remaining%=place;
        units.push(0x30+digit);
        if place==1{break;}
        place/=10;
    }
    Ok(old)
}

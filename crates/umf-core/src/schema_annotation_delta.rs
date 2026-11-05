// SPDX-License-Identifier: MIT OR Apache-2.0
//! Invocation-owned exact-name symbols and branch-local annotation deltas.
//! Symbol identity is established by full UTF-16 comparison, never object
//! position/address/hash. Each branch starts empty; only the interpreter's
//! existing explicit merge sites commit it. Dropping a failed branch rolls back.
use super::*;
use std::{cell::RefCell, collections::BTreeMap, rc::Rc};
#[derive(Debug, Default)]
struct Names {
    by_text: BTreeMap<Utf16, usize>,
    text: Vec<Utf16>,
}
#[derive(Clone, Debug)]
pub(super) struct PropertyDelta {
    names: Rc<RefCell<Names>>,
    slots: BTreeSet<usize>,
}
impl PropertyDelta {
    pub(super) fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        // Admit owner allocation and eventual release now; drop/unwind must
        // never consult controls after a terminal refusal.
        ctx.charge_work(2, Utf16::default())?;
        Ok(Self {
            names: Rc::new(RefCell::new(Names::default())),
            slots: BTreeSet::new(),
        })
    }
    pub(super) fn child(&self, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        Ok(Self {
            names: Rc::clone(&self.names),
            slots: BTreeSet::new(),
        })
    }
    fn symbol(
        &self,
        text: &Utf16,
        insert: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Option<usize>, EngineError> {
        let count = self.names.borrow().by_text.len();
        ctx.charge_work_u64(
            (text.len() as u64 + 1).saturating_mul(tree_compare_bound(count)),
            Utf16::default(),
        )?;
        let found = self.names.borrow().by_text.get(text).copied();
        if found.is_some() || !insert {
            return Ok(found);
        }
        let len = self.names.borrow().text.len();
        let capacity = self.names.borrow().text.capacity();
        ctx.charge_work(text.len().saturating_add(2), Utf16::default())?;
        let admitted = Utf16::shared(text.units().to_vec());
        if len == capacity {
            ctx.charge_work(len.saturating_add(1), Utf16::default())?;
        }
        ctx.charge_work_u64(
            (text.len() as u64 + 1)
                .saturating_mul(tree_compare_bound(count))
                .saturating_add(2),
            Utf16::default(),
        )?;
        let mut names = self.names.borrow_mut();
        // No callback occurs while the shared symbol table is borrowed.
        if len == capacity {
            names.text.reserve_exact(1);
        }
        names.text.push(admitted.clone());
        names.by_text.insert(admitted, len);
        Ok(Some(len))
    }
    pub(super) fn contains(
        &self,
        text: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        let Some(slot) = self.symbol(text, false, ctx)? else {
            return Ok(false);
        };
        ctx.charge_work_u64(tree_compare_bound(self.slots.len()), Utf16::default())?;
        Ok(self.slots.contains(&slot))
    }
    pub(super) fn insert(
        &mut self,
        text: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let slot = self.symbol(text, true, ctx)?.expect("inserted exact name");
        ctx.charge_work_u64(
            tree_compare_bound(self.slots.len()).saturating_add(2),
            Utf16::default(),
        )?;
        // The extra two units admit insertion storage and its later rollback/
        // release before either effect. Branch drop performs no later callback.
        self.slots.insert(slot);
        Ok(())
    }
    pub(super) fn merge(&mut self, other: Self, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        if Rc::ptr_eq(&self.names, &other.names) {
            for slot in other.slots {
                ctx.charge_work_u64(
                    tree_compare_bound(self.slots.len()).saturating_add(2),
                    Utf16::default(),
                )?;
                self.slots.insert(slot);
            }
        } else {
            // Independently rooted invocations never share ordinal authority.
            // Re-admit exact text if an internal caller merges such a branch.
            for slot in other.slots {
                ctx.charge_work(1, Utf16::default())?;
                let text = other.names.borrow().text[slot].clone();
                self.insert(&text, ctx)?;
            }
        }
        Ok(())
    }
}

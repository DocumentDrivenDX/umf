// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shared immutable branch ancestry for an indexed, admitted owner only.
use super::*;
type Entry = (Vec<u16>, Utf16, usize);
#[derive(Clone, Debug)]
pub(super) enum DynamicScope {
    Legacy(Vec<Entry>),
    Shared(Arc<Vec<Entry>>),
}
impl Default for DynamicScope {
    fn default() -> Self {
        Self::Legacy(Vec::new())
    }
}
impl std::ops::Deref for DynamicScope {
    type Target = [Entry];
    fn deref(&self) -> &[Entry] {
        match self {
            Self::Legacy(v) => v,
            Self::Shared(v) => v,
        }
    }
}
impl<'a> IntoIterator for &'a DynamicScope {
    type Item = &'a Entry;
    type IntoIter = std::slice::Iter<'a, Entry>;
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}
impl DynamicScope {
    pub(super) fn shared(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        Ok(Self::Shared(Arc::new(Vec::new())))
    }
    pub(super) fn is_shared(&self) -> bool {
        matches!(self, Self::Shared(_))
    }
    pub(super) fn push(&mut self, entry: Entry, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        match self {
            Self::Legacy(v) => v.push(entry),
            Self::Shared(v) => {
                if Arc::strong_count(v) > 1 {
                    ctx.charge_work(v.len().saturating_add(2), Utf16::default())?;
                    for (name, path, _) in v.iter() {
                        ctx.charge_work(
                            name.len().saturating_add(path.len()).saturating_add(2),
                            Utf16::default(),
                        )?;
                    }
                    let mut copied = Vec::with_capacity(v.len().saturating_add(1));
                    copied.extend(v.iter().cloned());
                    copied.push(entry);
                    *v = Arc::new(copied);
                } else {
                    let data = Arc::get_mut(v).expect("unique scope");
                    if data.len() == data.capacity() {
                        ctx.charge_work(data.len().saturating_add(1), Utf16::default())?;
                        data.reserve_exact(1);
                    }
                    data.push(entry);
                }
            }
        }
        Ok(())
    }
    fn restore_len(&mut self, len: usize) {
        match self {
            Self::Legacy(v) => v.truncate(len),
            // Shared callers retain and restore their previous Arc, never
            // allocate/copy ancestry after a terminal result.
            Self::Shared(v) => {
                if let Some(v) = Arc::get_mut(v) {
                    v.truncate(len);
                }
            }
        }
    }
}
pub(super) struct EvaluationScope<'a> {
    pub(super) state: &'a mut Evaluated,
    prior_shared: Option<DynamicScope>,
    prior_len: usize,
    prior_policy: KeywordPolicy,
    prior_resource: Option<usize>,
    prior_cursor: Option<OwnerCursor>,
    prior_selected: Option<OwnerCursor>,
}
impl<'a> EvaluationScope<'a> {
    pub(super) fn enter(
        state: &'a mut Evaluated,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let prior_shared = if state.dynamic_scope.is_shared() {
            ctx.charge_work(1, Utf16::default())?;
            Some(state.dynamic_scope.clone())
        } else {
            None
        };
        let prior_len = state.dynamic_scope.len();
        let prior_policy = state.keyword_policy;
        let prior_resource = state.resolved_resource;
        let prior_cursor=state.schema_cursor.take();
        let prior_selected=state.selected_cursor.take();
        Ok(Self {
            state,
            prior_shared,
            prior_len,
            prior_policy,
            prior_resource,prior_cursor,prior_selected,
        })
    }
}
impl Drop for EvaluationScope<'_> {
    fn drop(&mut self) {
        if let Some(prior) = self.prior_shared.take() {
            self.state.dynamic_scope = prior;
        } else {
            self.state.dynamic_scope.restore_len(self.prior_len);
        }
        self.state.keyword_policy = self.prior_policy;
        self.state.resolved_resource = self.prior_resource;
        self.state.schema_cursor=self.prior_cursor.take();
        self.state.selected_cursor=self.prior_selected.take();
    }
}

// Private evaluator read-only coercion. It cannot mint or recover custody from
// a Utf16, and has no Clone/From implementation. Diagnostic outputs remain text.
impl std::ops::Deref for EvaluationPathPair {
    type Target = Utf16;
    fn deref(&self) -> &Utf16 { self.text() }
}
impl AsRef<Utf16> for EvaluationPathPair {
    fn as_ref(&self) -> &Utf16 { self.text() }
}

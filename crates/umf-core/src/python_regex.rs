// SPDX-License-Identifier: MIT OR Apache-2.0
//! A host-independent interpreter for the Python `re` consumer profile.
//!
//! The parser builds a small Python-regex AST. Matching is executed by an
//! explicit heap worklist; input length and repeat counts never consume Rust
//! call stack. Unicode classification is intentionally versioned at the API
//! boundary so callers cannot silently inherit the build host's regex rules.

use crate::{context::Context, error::EngineError, value::Utf16};
use std::{collections::BTreeMap, sync::Arc};
#[path = "python_re_tables.rs"]
mod tables;
const UNICODE_NAMES: &[u8] = include_bytes!("python_re_names.dat");

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PythonReVersion {
    V3_11,
    V3_12,
    V3_13,
}

impl PythonReVersion {
    pub fn from_minor(minor: u8) -> Result<Self, PythonRegexError> {
        match minor {
            11 => Ok(Self::V3_11),
            12 => Ok(Self::V3_12),
            13 => Ok(Self::V3_13),
            _ => Err(PythonRegexError::profile(minor)),
        }
    }

    pub const fn minor(self) -> u8 {
        match self {
            Self::V3_11 => 11,
            Self::V3_12 => 12,
            Self::V3_13 => 13,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PythonRegexError {
    code: &'static str,
    message: String,
    offset: usize,
    resource_error: Option<EngineError>,
}

impl PythonRegexError {
    fn syntax(message: impl Into<String>, offset: usize) -> Self {
        Self {
            code: "PYTHON_REGEX_SYNTAX",
            message: message.into(),
            offset,
            resource_error: None,
        }
    }
    fn resource(error: EngineError, offset: usize) -> Self {
        Self {
            code: "PYTHON_REGEX_RESOURCE_ERROR",
            message: String::from_utf16_lossy(error.message.units()),
            offset,
            resource_error: Some(error),
        }
    }
    fn profile(minor: u8) -> Self {
        Self {
            code: "PYTHON_REGEX_PROFILE_UNAVAILABLE",
            message: format!("Python re profile 3.{minor} is unavailable"),
            offset: 0,
            resource_error: None,
        }
    }
    pub fn code(&self) -> &'static str {
        self.code
    }
    pub fn message(&self) -> &str {
        &self.message
    }
    pub fn offset(&self) -> usize {
        self.offset
    }
    fn into_engine_error(self, fallback_path: Utf16) -> EngineError {
        self.resource_error
            .unwrap_or_else(|| EngineError::new(self.code, fallback_path, self.message))
    }
}

#[derive(Clone, Debug)]
pub struct PythonRegex {
    programs: Vec<Program>,
    entry: usize,
    groups: usize,
    version: PythonReVersion,
    info_charset: Option<(Class, Flags)>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct Flags(u16);
impl Flags {
    const IGNORECASE: u16 = 1;
    const DOTALL: u16 = 2;
    const MULTILINE: u16 = 4;
    const ASCII: u16 = 8;
    const VERBOSE: u16 = 16;
    // `u` is accepted by str patterns but is the default mode. Keeping the
    // bit makes the ASCII/Unicode mutual-exclusion check explicit.
    const UNICODE: u16 = 32;
    const TEMPLATE: u16 = 64;
    fn has(self, bit: u16) -> bool {
        self.0 & bit != 0
    }
}

#[derive(Clone, Debug)]
enum Node {
    Empty,
    Literal(u32, Flags),
    Any(Flags),
    Class(Class, Flags),
    Anchor(Anchor, Flags),
    Seq(Vec<Node>),
    Alt(Vec<Node>),
    Repeat {
        node: Box<Node>,
        min: u64,
        max: Option<u64>,
        greedy: bool,
        id: usize,
    },
    Group {
        index: usize,
        node: Box<Node>,
    },
    Atomic(Box<Node>),
    Backref {
        index: usize,
        flags: Flags,
        width: Option<usize>,
    },
    Look {
        node: Arc<Node>,
        positive: bool,
        behind: bool,
        width: Option<usize>,
    },
    Conditional {
        index: usize,
        yes: Box<Node>,
        no: Box<Node>,
    },
}

#[derive(Clone, Debug)]
struct Class {
    negated: bool,
    atoms: Vec<ClassAtom>,
}
#[derive(Clone, Debug)]
enum ClassAtom {
    Char(u32),
    Range(u32, u32),
    Category(Category, bool),
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Category {
    Digit,
    Space,
    Word,
}
#[derive(Clone, Copy, Debug)]
enum Anchor {
    Beginning,
    End,
    AbsoluteBeginning,
    AbsoluteEnd,
    Boundary(bool),
}

#[derive(Clone, Debug)]
enum Inst {
    Char(u32, Flags, usize),
    Any(Flags, usize),
    Class(Class, Flags, usize),
    Anchor(Anchor, Flags, usize),
    Split(usize, usize),
    SaveStart(usize, usize),
    SaveEnd(usize, usize),
    Backref(usize, Flags, usize),
    Repeat {
        id: usize,
        body: usize,
        exit: usize,
        min: u64,
        max: Option<u64>,
        greedy: bool,
    },
    RepeatEnd(usize, usize),
    Look {
        program: usize,
        positive: bool,
        behind: bool,
        width: Option<usize>,
        next: usize,
    },
    Conditional {
        index: usize,
        yes: usize,
        no: usize,
    },
    AtomicStart(usize),
    AtomicEnd(usize),
    Match,
}

#[derive(Clone, Debug)]
struct Program {
    code: Vec<Inst>,
    entry: usize,
}

impl PythonRegex {
    pub fn compile(pattern: &Utf16, version: PythonReVersion) -> Result<Self, PythonRegexError> {
        let mut ctx = Context::ordinary();
        ctx.charge_work(pattern.len(), Utf16::default())
            .map_err(|_| PythonRegexError::syntax("pattern admission work was not admitted", 0))?;
        charge_compile_work(&mut ctx, pattern.len()).map_err(|_| {
            PythonRegexError::syntax("pattern compilation work was not admitted", 0)
        })?;
        Self::compile_inner(utf16_codepoints(pattern.units()), version, &mut ctx)
    }

    /// Compile a Python `str` represented as Unicode code points. Unlike the
    /// UTF-16 convenience API, this distinguishes a pair of explicit
    /// surrogate code points from one astral scalar.
    pub fn compile_codepoints(
        pattern: &[u32],
        version: PythonReVersion,
    ) -> Result<Self, PythonRegexError> {
        let mut ctx = Context::ordinary();
        ctx.charge_work(pattern.len(), Utf16::default())
            .map_err(|_| PythonRegexError::syntax("pattern admission work was not admitted", 0))?;
        validate_codepoints(pattern)?;
        ctx.charge_work(utf16_len(pattern), Utf16::default())
            .map_err(|_| PythonRegexError::syntax("pattern admission work was not admitted", 0))?;
        charge_compile_work(&mut ctx, pattern.len()).map_err(|_| {
            PythonRegexError::syntax("pattern compilation work was not admitted", 0)
        })?;
        Self::compile_inner(pattern.to_vec(), version, &mut ctx)
    }

    pub fn compile_with_context(
        pattern: &Utf16,
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        ctx.charge_work(pattern.len(), Utf16::default())?;
        charge_compile_work(ctx, pattern.len())?;
        Self::compile_inner(utf16_codepoints(pattern.units()), version, ctx).map_err(|e| {
            let path = Utf16::new(pattern.units().iter().take(e.offset()).copied().collect());
            e.into_engine_error(path)
        })
    }

    pub fn compile_codepoints_with_context(
        pattern: &[u32],
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        ctx.charge_work(pattern.len(), Utf16::default())?;
        validate_codepoints(pattern)
            .map_err(|e| EngineError::new(e.code(), Utf16::default(), e.message()))?;
        ctx.charge_work(utf16_len(pattern), Utf16::default())?;
        charge_compile_work(ctx, pattern.len())?;
        Self::compile_inner(pattern.to_vec(), version, ctx)
            .map_err(|e| e.into_engine_error(Utf16::default()))
    }

    fn compile_inner(
        chars: Vec<u32>,
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<Self, PythonRegexError> {
        let mut parser = Parser::new(chars, version, ctx);
        let (tree, groups, global_flags) = parser.parse()?;
        let info_charset = info_charset(&tree, global_flags, version);
        let mut compiler = Compiler::default();
        let end = compiler.push(Inst::Match);
        let entry = compiler.emit(&tree, end)?;
        let mut programs = vec![Program {
            code: std::mem::take(&mut compiler.code),
            entry,
        }];
        let mut pending = std::mem::take(&mut compiler.pending);
        while let Some(look) = pending.pop() {
            let mut sub = Compiler::default();
            let end = sub.push(Inst::Match);
            let sub_entry = sub.emit(&look.node, end)?;
            let sub_program = programs.len();
            if let Some(Inst::Look { program, .. }) = programs
                .get_mut(look.parent_program)
                .and_then(|program| program.code.get_mut(look.instruction))
            {
                *program = sub_program;
            } else {
                return Err(PythonRegexError::syntax("invalid lookaround patch", 0));
            }
            pending.extend(sub.pending.into_iter().map(|mut nested| {
                nested.parent_program = sub_program;
                nested
            }));
            programs.push(Program {
                code: sub.code,
                entry: sub_entry,
            });
        }
        Ok(Self {
            programs,
            entry,
            groups,
            version,
            info_charset,
        })
    }

    /// Find the first match at or after a Python codepoint offset. The returned
    /// offsets are Python string indices, not UTF-16 code-unit offsets.
    pub fn find_from_utf16(
        &self,
        text: &[u16],
        start_codepoint_index: usize,
    ) -> Option<(usize, usize)> {
        let mut ctx = Context::ordinary();
        self.find_from_utf16_with_context(text, start_codepoint_index, &mut ctx)
            .ok()
            .flatten()
    }

    pub fn find_from_utf16_with_context(
        &self,
        text: &[u16],
        start_codepoint_index: usize,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(usize, usize)>, EngineError> {
        ctx.charge_work(text.len(), Utf16::default())?;
        let chars = utf16_codepoints(text);
        self.search_codepoints(&chars, start_codepoint_index, ctx)
    }

    pub fn find_from_codepoints(
        &self,
        text: &[u32],
        start_codepoint_index: usize,
    ) -> Option<(usize, usize)> {
        let mut ctx = Context::ordinary();
        self.find_from_codepoints_with_context(text, start_codepoint_index, &mut ctx)
            .ok()
            .flatten()
    }

    pub fn find_from_codepoints_with_context(
        &self,
        text: &[u32],
        start_codepoint_index: usize,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(usize, usize)>, EngineError> {
        ctx.charge_work(text.len(), Utf16::default())?;
        validate_codepoints(text)
            .map_err(|e| EngineError::new(e.code(), Utf16::default(), e.message()))?;
        ctx.charge_work(utf16_len(text), Utf16::default())?;
        self.search_codepoints(text, start_codepoint_index, ctx)
    }

    fn search_codepoints(
        &self,
        chars: &[u32],
        start_codepoint_index: usize,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(usize, usize)>, EngineError> {
        let start = start_codepoint_index.min(chars.len());
        for candidate in start..=chars.len() {
            if candidate < chars.len() {
                if let Some((class, flags)) = &self.info_charset {
                    if !class_matches(class, chars[candidate], *flags, self.version, ctx)? {
                        continue;
                    }
                }
            }
            if let Some(matched) = run(
                &self.programs,
                0,
                self.entry,
                chars,
                candidate,
                self.groups,
                self.version,
                None,
                None,
                ctx,
            )? {
                return Ok(Some((candidate, matched.pos)));
            }
        }
        Ok(None)
    }
}

/// CPython emits an INFO charset for a narrow class of leading constructs.
/// The optimizer unwraps scoped subpatterns to find the charset, then compiles
/// it with the *outer* flags. Keeping this separate from the VM's actual
/// instructions reproduces observable INFO prefilter behavior, including the
/// historical scoped-flag mismatch.
fn info_charset(
    root: &Node,
    global_flags: Flags,
    version: PythonReVersion,
) -> Option<(Class, Flags)> {
    fn first(node: &Node) -> Option<&Node> {
        match node {
            Node::Group { node, .. } => first(node),
            Node::Seq(nodes) => nodes.first().and_then(first),
            _ => Some(node),
        }
    }
    let node = first(root)?;
    let (class, effective_flags) = match node {
        Node::Class(class, flags) => (class, *flags),
        Node::Alt(branches) => {
            let mut atoms = Vec::with_capacity(branches.len());
            for branch in branches {
                match first(branch)? {
                    Node::Literal(c, flags) if !flags.has(Flags::IGNORECASE) => {
                        atoms.push(ClassAtom::Char(*c));
                    }
                    _ => return None,
                }
            }
            let class = Class {
                negated: false,
                atoms,
            };
            return Some((class, global_flags));
        }
        _ => return None,
    };
    if effective_flags.has(Flags::IGNORECASE)
        && class
            .atoms
            .iter()
            .any(|atom| class_atom_has_cased(atom, effective_flags, version))
    {
        // CPython's `_get_charset_prefix` declines a case-insensitive
        // charset only when it contains literal/range members. Category
        // opcodes are retained and the INFO charset is then compiled under
        // the outer flags, which is observably different for scoped flags.
        return None;
    }
    Some((class.clone(), global_flags))
}

fn class_atom_has_cased(atom: &ClassAtom, flags: Flags, version: PythonReVersion) -> bool {
    let is_cased = |c: u32| {
        if flags.has(Flags::ASCII) {
            return matches!(c, 0x41..=0x5a | 0x61..=0x7a);
        }
        simple_fold(c, version) != c
            || pair_key_exists(lower_reverse(version), c)
            || pair_key_exists(casefix_reverse(version), c)
    };
    match atom {
        ClassAtom::Char(c) => is_cased(*c),
        ClassAtom::Range(start, end) => {
            is_cased(*start)
                || is_cased(*end)
                || pair_key_in_range(lower_reverse(version), *start, *end)
                || pair_key_in_range(casefix_reverse(version), *start, *end)
        }
        ClassAtom::Category(..) => false,
    }
}

fn pair_key_exists(pairs: &[(u32, u32)], key: u32) -> bool {
    let index = pairs.partition_point(|(item, _)| *item < key);
    pairs.get(index).is_some_and(|(item, _)| *item == key)
}

fn pair_key_in_range(pairs: &[(u32, u32)], start: u32, end: u32) -> bool {
    if start > end {
        return false;
    }
    let index = pairs.partition_point(|(item, _)| *item < start);
    pairs.get(index).is_some_and(|(item, _)| *item <= end)
}

fn charge_compile_work(
    ctx: &mut Context<'_>,
    pattern_codepoints: usize,
) -> Result<(), EngineError> {
    // A token can create one AST node, several program instructions and
    // worklist entries. Admit a conservative upper bound before parser input,
    // syntax trees, compiler tasks, or bytecode vectors are allocated.
    let amount = pattern_codepoints
        .checked_mul(8)
        .ok_or_else(|| EngineError::new("LIMIT", Utf16::default(), "Regex work overflow"))?;
    ctx.charge_work(amount, Utf16::default())
}

#[derive(Clone)]
struct PendingLook {
    parent_program: usize,
    instruction: usize,
    node: Arc<Node>,
}

#[derive(Default)]
struct Compiler {
    code: Vec<Inst>,
    pending: Vec<PendingLook>,
}
impl Compiler {
    fn push(&mut self, i: Inst) -> usize {
        let p = self.code.len();
        self.code.push(i);
        p
    }
    fn emit(&mut self, root: &Node, next: usize) -> Result<usize, PythonRegexError> {
        enum Task<'a> {
            Visit(&'a Node, usize),
            Group(usize, usize),
            Atomic(usize),
            Sequence(&'a [Node], usize, usize),
            SequenceAfter(&'a [Node], usize),
            Alternative(usize),
            Repeat {
                id: usize,
                body_pos: usize,
                exit: usize,
                min: u64,
                max: Option<u64>,
                greedy: bool,
            },
            Conditional(usize),
        }
        let mut tasks = vec![Task::Visit(root, next)];
        let mut entries = Vec::new();
        while let Some(task) = tasks.pop() {
            match task {
                Task::Visit(node, next) => match node {
                    Node::Empty => entries.push(next),
                    Node::Literal(c, f) => entries.push(self.push(Inst::Char(*c, *f, next))),
                    Node::Any(f) => entries.push(self.push(Inst::Any(*f, next))),
                    Node::Class(c, f) => entries.push(self.push(Inst::Class(c.clone(), *f, next))),
                    Node::Anchor(a, f) => entries.push(self.push(Inst::Anchor(*a, *f, next))),
                    Node::Backref { index, flags, .. } => {
                        entries.push(self.push(Inst::Backref(*index, *flags, next)))
                    }
                    Node::Seq(nodes) => {
                        tasks.push(Task::Sequence(nodes, nodes.len(), next));
                    }
                    Node::Alt(nodes) => {
                        if nodes.is_empty() {
                            return Err(PythonRegexError::syntax("empty alternative", 0));
                        }
                        tasks.push(Task::Alternative(nodes.len()));
                        for child in nodes.iter().rev() {
                            tasks.push(Task::Visit(child, next));
                        }
                    }
                    Node::Group { index, node } => {
                        let end = self.push(Inst::SaveEnd(*index, next));
                        tasks.push(Task::Group(*index, next));
                        tasks.push(Task::Visit(node, end));
                    }
                    Node::Atomic(node) => {
                        let end = self.push(Inst::AtomicEnd(next));
                        tasks.push(Task::Atomic(next));
                        tasks.push(Task::Visit(node, end));
                    }
                    Node::Repeat {
                        node,
                        min,
                        max,
                        greedy,
                        id,
                    } => {
                        let body_pos = self.push(Inst::RepeatEnd(*id, 0));
                        tasks.push(Task::Repeat {
                            id: *id,
                            body_pos,
                            exit: next,
                            min: *min,
                            max: *max,
                            greedy: *greedy,
                        });
                        tasks.push(Task::Visit(node, body_pos));
                    }
                    Node::Look {
                        node,
                        positive,
                        behind,
                        width,
                    } => {
                        let instruction = self.push(Inst::Look {
                            program: usize::MAX,
                            positive: *positive,
                            behind: *behind,
                            width: *width,
                            next,
                        });
                        self.pending.push(PendingLook {
                            parent_program: 0,
                            instruction,
                            node: Arc::clone(node),
                        });
                        entries.push(instruction);
                    }
                    Node::Conditional { index, yes, no } => {
                        tasks.push(Task::Conditional(*index));
                        tasks.push(Task::Visit(no, next));
                        tasks.push(Task::Visit(yes, next));
                    }
                },
                Task::Group(index, next) => {
                    let body = entries
                        .pop()
                        .ok_or_else(|| PythonRegexError::syntax("compiler stack underflow", 0))?;
                    let _ = next;
                    entries.push(self.push(Inst::SaveStart(index, body)));
                }
                Task::Atomic(next) => {
                    let body = entries
                        .pop()
                        .ok_or_else(|| PythonRegexError::syntax("compiler stack underflow", 0))?;
                    let _ = next;
                    entries.push(self.push(Inst::AtomicStart(body)));
                }
                Task::Sequence(nodes, index, target) => {
                    if index == 0 {
                        entries.push(target);
                    } else {
                        tasks.push(Task::SequenceAfter(nodes, index - 1));
                        tasks.push(Task::Visit(&nodes[index - 1], target));
                    }
                }
                Task::SequenceAfter(nodes, index) => {
                    let target = entries
                        .pop()
                        .ok_or_else(|| PythonRegexError::syntax("compiler stack underflow", 0))?;
                    tasks.push(Task::Sequence(nodes, index, target));
                }
                Task::Alternative(count) => {
                    let start = entries
                        .len()
                        .checked_sub(count)
                        .ok_or_else(|| PythonRegexError::syntax("compiler stack underflow", 0))?;
                    let mut branches: Vec<_> = entries.drain(start..).collect();
                    let mut target = branches
                        .pop()
                        .ok_or_else(|| PythonRegexError::syntax("empty alternative", 0))?;
                    while let Some(branch) = branches.pop() {
                        target = self.push(Inst::Split(branch, target));
                    }
                    entries.push(target);
                }
                Task::Repeat {
                    id,
                    body_pos,
                    exit,
                    min,
                    max,
                    greedy,
                } => {
                    let body = entries
                        .pop()
                        .ok_or_else(|| PythonRegexError::syntax("compiler stack underflow", 0))?;
                    let repeat = self.push(Inst::Repeat {
                        id,
                        body,
                        exit,
                        min,
                        max,
                        greedy,
                    });
                    self.code[body_pos] = Inst::RepeatEnd(id, repeat);
                    entries.push(repeat);
                }
                Task::Conditional(index) => {
                    let no = entries
                        .pop()
                        .ok_or_else(|| PythonRegexError::syntax("compiler stack underflow", 0))?;
                    let yes = entries
                        .pop()
                        .ok_or_else(|| PythonRegexError::syntax("compiler stack underflow", 0))?;
                    entries.push(self.push(Inst::Conditional { index, yes, no }));
                }
            }
        }
        if entries.len() != 1 {
            return Err(PythonRegexError::syntax(
                "compiler result stack mismatch",
                0,
            ));
        }
        Ok(entries.pop().expect("one compiler result"))
    }
}
#[derive(Clone)]
struct State {
    pc: usize,
    pos: usize,
    captures: Vec<Option<(usize, usize)>>,
    repeats: Vec<(usize, u64, usize)>,
    atomic: Vec<usize>,
}

struct RunFrame {
    program: usize,
    todo: Vec<State>,
    current: Option<State>,
    required_end: Option<usize>,
    pending_look: Option<(bool, usize)>,
}

fn propagate_run_result(frames: &mut Vec<RunFrame>, result: Option<State>) {
    frames.pop();
    let Some(parent) = frames.last_mut() else {
        return;
    };
    let Some((positive, next)) = parent.pending_look.take() else {
        return;
    };
    if result.is_some() == positive {
        let Some(state) = parent.current.as_mut() else {
            return;
        };
        if positive {
            state.captures = result.expect("positive look has a result").captures;
        }
        state.pc = next;
    } else {
        parent.current = None;
    }
}

fn charge_state_copy(state: &State, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let cost = state
        .captures
        .len()
        .saturating_add(state.repeats.len())
        .saturating_add(state.atomic.len())
        .saturating_add(1);
    ctx.charge_work(cost, Utf16::default())
}

fn run(
    programs: &[Program],
    program: usize,
    entry: usize,
    text: &[u32],
    start: usize,
    groups: usize,
    version: PythonReVersion,
    required_end: Option<usize>,
    initial_captures: Option<&[Option<(usize, usize)>]>,
    ctx: &mut Context<'_>,
) -> Result<Option<State>, EngineError> {
    let capture_count = initial_captures.map_or(groups + 1, <[Option<(usize, usize)>]>::len);
    ctx.charge_work(capture_count.saturating_add(1), Utf16::default())?;
    let mut frames = vec![RunFrame {
        program,
        todo: vec![State {
            pc: entry,
            pos: start,
            captures: initial_captures
                .map(|captures| captures.to_vec())
                .unwrap_or_else(|| vec![None; groups + 1]),
            repeats: Vec::new(),
            atomic: Vec::new(),
        }],
        current: None,
        required_end,
        pending_look: None,
    }];
    loop {
        let Some(frame) = frames.last_mut() else {
            return Ok(None);
        };
        if frame.current.is_none() {
            frame.current = frame.todo.pop();
            if frame.current.is_none() {
                if frames.len() == 1 {
                    return Ok(None);
                }
                propagate_run_result(&mut frames, None);
                continue;
            }
        }
        let mut s = frames
            .last_mut()
            .expect("frame")
            .current
            .take()
            .expect("state");
        let mut suspended = false;
        loop {
            ctx.charge_work(1, Utf16::default())?;
            let code = &programs[frames.last().expect("frame").program].code;
            let Some(ins) = code.get(s.pc) else { break };
            match ins {
                Inst::Match => {
                    if frames
                        .last()
                        .expect("frame")
                        .required_end
                        .map_or(true, |e| s.pos == e)
                    {
                        if frames.len() == 1 {
                            return Ok(Some(s));
                        }
                        propagate_run_result(&mut frames, Some(s));
                        suspended = true;
                    }
                    break;
                }
                Inst::Split(a, b) => {
                    charge_state_copy(&s, ctx)?;
                    ctx.charge_work(1, Utf16::default())?;
                    let mut branch = s.clone();
                    branch.pc = *b;
                    frames.last_mut().expect("frame").todo.push(branch);
                    s.pc = *a;
                }
                Inst::Char(c, f, next) => {
                    if s.pos < text.len() && eq_char(*c, text[s.pos], *f, version, ctx)? {
                        s.pos += 1;
                        s.pc = *next
                    } else {
                        break;
                    }
                }
                Inst::Any(f, next) => {
                    if s.pos < text.len() && (f.has(Flags::DOTALL) || !is_linebreak(text[s.pos])) {
                        s.pos += 1;
                        s.pc = *next
                    } else {
                        break;
                    }
                }
                Inst::Class(c, f, next) => {
                    if s.pos < text.len() && class_matches(c, text[s.pos], *f, version, ctx)? {
                        s.pos += 1;
                        s.pc = *next
                    } else {
                        break;
                    }
                }
                Inst::Anchor(a, f, next) => {
                    if anchor_matches(*a, *f, text, s.pos, version) {
                        s.pc = *next
                    } else {
                        break;
                    }
                }
                Inst::SaveStart(i, next) => {
                    if let Some(c) = s.captures.get_mut(*i) {
                        *c = Some((s.pos, usize::MAX));
                    }
                    s.pc = *next
                }
                Inst::SaveEnd(i, next) => {
                    if let Some(capture) = s.captures.get_mut(*i) {
                        if let Some((start, _)) = *capture {
                            *capture = Some((start, s.pos));
                        }
                    }
                    s.pc = *next
                }
                Inst::Backref(i, f, next) => {
                    let Some(Some((a, b))) = s.captures.get(*i) else {
                        break;
                    };
                    let n = b - a;
                    if s.pos + n > text.len() {
                        break;
                    }
                    ctx.charge_work(n, Utf16::default())?;
                    let matched = (0..n)
                        .all(|k| eq_backreference_char(text[a + k], text[s.pos + k], *f, version));
                    if matched {
                        s.pos += n;
                        s.pc = *next
                    } else {
                        break;
                    }
                }
                Inst::Repeat {
                    id,
                    body,
                    exit,
                    min,
                    max,
                    greedy,
                } => {
                    ctx.charge_work(s.repeats.len(), Utf16::default())?;
                    let idx = s.repeats.iter().position(|x| x.0 == *id);
                    let (count, last) = idx
                        .map(|i| (s.repeats[i].1, s.repeats[i].2))
                        .unwrap_or((0, s.pos));
                    if max.is_some_and(|m| count >= m) {
                        if let Some(i) = idx {
                            ctx.charge_work(s.repeats.len().saturating_sub(i), Utf16::default())?;
                            s.repeats.remove(i);
                        }
                        s.pc = *exit;
                        continue;
                    }
                    if count < *min {
                        if let Some(i) = idx {
                            s.repeats[i].2 = s.pos
                        } else {
                            ctx.charge_work(1, Utf16::default())?;
                            s.repeats.push((*id, count, s.pos));
                        }
                        s.pc = *body;
                        continue;
                    }
                    if idx.is_some() && s.pos == last {
                        if let Some(i) = idx {
                            ctx.charge_work(s.repeats.len().saturating_sub(i), Utf16::default())?;
                            s.repeats.remove(i);
                        }
                        s.pc = *exit;
                        continue;
                    }
                    charge_state_copy(&s, ctx)?;
                    let mut other = s.clone();
                    if let Some(i) = idx {
                        ctx.charge_work(other.repeats.len().saturating_sub(i), Utf16::default())?;
                        other.repeats.remove(i);
                    }
                    other.pc = *exit;
                    if *greedy {
                        ctx.charge_work(1, Utf16::default())?;
                        frames.last_mut().expect("frame").todo.push(other);
                        if let Some(i) = idx {
                            s.repeats[i].2 = s.pos
                        } else {
                            ctx.charge_work(1, Utf16::default())?;
                            s.repeats.push((*id, count, s.pos));
                        }
                        s.pc = *body;
                    } else {
                        charge_state_copy(&s, ctx)?;
                        let mut body_state = s.clone();
                        if let Some(i) = idx {
                            body_state.repeats[i].2 = body_state.pos
                        } else {
                            ctx.charge_work(1, Utf16::default())?;
                            body_state.repeats.push((*id, count, body_state.pos));
                        }
                        body_state.pc = *body;
                        ctx.charge_work(1, Utf16::default())?;
                        frames.last_mut().expect("frame").todo.push(body_state);
                        if let Some(i) = idx {
                            ctx.charge_work(s.repeats.len().saturating_sub(i), Utf16::default())?;
                            s.repeats.remove(i);
                        }
                        s.pc = *exit;
                    }
                }
                Inst::RepeatEnd(id, target) => {
                    ctx.charge_work(s.repeats.len(), Utf16::default())?;
                    if let Some(i) = s.repeats.iter().position(|x| x.0 == *id) {
                        s.repeats[i].1 = s.repeats[i].1.saturating_add(1);
                    }
                    s.pc = *target
                }
                Inst::Look {
                    program: sub_program,
                    positive,
                    behind,
                    width,
                    next,
                } => {
                    let behind_start = if *behind {
                        width.and_then(|w| s.pos.checked_sub(w))
                    } else {
                        Some(s.pos)
                    };
                    if let Some(child_start) = behind_start {
                        s.pc = *next;
                        let child_required = if *behind { Some(s.pos) } else { None };
                        ctx.charge_work(s.captures.len(), Utf16::default())?;
                        let child_captures = s.captures.clone();
                        let child = &programs[*sub_program];
                        charge_state_copy(&s, ctx)?;
                        frames.last_mut().expect("frame").current = Some(s.clone());
                        ctx.charge_work(s.captures.len().saturating_add(2), Utf16::default())?;
                        frames.last_mut().expect("frame").pending_look = Some((*positive, *next));
                        ctx.charge_work(2, Utf16::default())?;
                        frames.push(RunFrame {
                            program: *sub_program,
                            todo: vec![State {
                                pc: child.entry,
                                pos: child_start,
                                captures: child_captures,
                                repeats: Vec::new(),
                                atomic: Vec::new(),
                            }],
                            current: None,
                            required_end: child_required,
                            pending_look: None,
                        });
                        suspended = true;
                    } else {
                        if *positive {
                            break;
                        }
                        s.pc = *next;
                    }
                }
                Inst::Conditional { index, yes, no } => {
                    s.pc =
                        if s.captures.get(*index).is_some_and(|capture| {
                            capture.is_some_and(|(_, end)| end != usize::MAX)
                        }) {
                            *yes
                        } else {
                            *no
                        }
                }
                Inst::AtomicStart(next) => {
                    ctx.charge_work(1, Utf16::default())?;
                    s.atomic.push(frames.last().expect("frame").todo.len());
                    s.pc = *next
                }
                Inst::AtomicEnd(next) => {
                    if let Some(mark) = s.atomic.pop() {
                        frames.last_mut().expect("frame").todo.truncate(mark)
                    }
                    s.pc = *next
                }
            }
            if suspended {
                break;
            }
        }
        if !suspended {
            if let Some(frame) = frames.last_mut() {
                frame.current = None;
            }
        }
    }
}

fn utf16_codepoints(units: &[u16]) -> Vec<u32> {
    let mut out = Vec::with_capacity(units.len());
    let mut i = 0;
    while i < units.len() {
        let a = units[i];
        if (0xd800..=0xdbff).contains(&a)
            && i + 1 < units.len()
            && (0xdc00..=0xdfff).contains(&units[i + 1])
        {
            out.push(0x10000 + (((a as u32 - 0xd800) << 10) | (units[i + 1] as u32 - 0xdc00)));
            i += 2
        } else {
            out.push(a as u32);
            i += 1
        }
    }
    out
}

fn validate_codepoints(codepoints: &[u32]) -> Result<(), PythonRegexError> {
    if let Some((offset, _)) = codepoints
        .iter()
        .enumerate()
        .find(|(_, codepoint)| **codepoint > 0x10ffff)
    {
        return Err(PythonRegexError::syntax(
            "Python string contains an out-of-range code point",
            offset,
        ));
    }
    Ok(())
}

fn utf16_len(codepoints: &[u32]) -> usize {
    codepoints
        .iter()
        .map(|codepoint| if *codepoint > 0xffff { 2 } else { 1 })
        .sum()
}

fn lookup_unicode_name(
    name: &[u8],
    version: PythonReVersion,
    ctx: &mut Context<'_>,
) -> Result<Option<u32>, EngineError> {
    let Some(first) = name.first().copied().map(usize::from) else {
        return Ok(None);
    };
    let Some(magic) = UNICODE_NAMES.get(..8) else {
        return Ok(None);
    };
    if first >= 128 || magic != b"UMFPNAM1" {
        return Ok(None);
    }
    let index = 8 + first * 8;
    let Some(start_bytes) = UNICODE_NAMES.get(index..index + 4) else {
        return Ok(None);
    };
    let Ok(start_bytes) = <[u8; 4]>::try_from(start_bytes) else {
        return Ok(None);
    };
    let start = u32::from_le_bytes(start_bytes) as usize;
    let Some(end_bytes) = UNICODE_NAMES.get(index + 4..index + 8) else {
        return Ok(None);
    };
    let Ok(end_bytes) = <[u8; 4]>::try_from(end_bytes) else {
        return Ok(None);
    };
    let end = u32::from_le_bytes(end_bytes) as usize;
    if start == end {
        return Ok(None);
    }
    let mut pos = start;
    ctx.charge_work(96, Utf16::default())?;
    let mut current = Vec::<u8>::with_capacity(96);
    while pos < end {
        let Some(prefix) = UNICODE_NAMES.get(pos).copied().map(usize::from) else {
            return Ok(None);
        };
        let Some(suffix_len) = UNICODE_NAMES.get(pos + 1).copied().map(usize::from) else {
            return Ok(None);
        };
        ctx.charge_work(
            prefix.saturating_add(suffix_len).saturating_add(1),
            Utf16::default(),
        )?;
        pos += 2;
        if prefix > current.len() {
            return Ok(None);
        }
        current.truncate(prefix);
        let Some(suffix) = UNICODE_NAMES.get(pos..pos + suffix_len) else {
            return Ok(None);
        };
        current.extend_from_slice(suffix);
        pos += suffix_len;
        let Some(cp_hi) = UNICODE_NAMES.get(pos).copied() else {
            return Ok(None);
        };
        let Some(cp_mid) = UNICODE_NAMES.get(pos + 1).copied() else {
            return Ok(None);
        };
        let Some(cp_lo) = UNICODE_NAMES.get(pos + 2).copied() else {
            return Ok(None);
        };
        let cp = u32::from_be_bytes([0, cp_hi, cp_mid, cp_lo]);
        let Some(minor) = UNICODE_NAMES.get(pos + 3).copied() else {
            return Ok(None);
        };
        pos += 4;
        ctx.charge_work(current.len().min(name.len()), Utf16::default())?;
        match current.as_slice().cmp(name) {
            std::cmp::Ordering::Equal => return Ok((version.minor() >= minor).then_some(cp)),
            std::cmp::Ordering::Greater => return Ok(None),
            std::cmp::Ordering::Less => {}
        }
    }
    Ok(None)
}
fn is_linebreak(c: u32) -> bool {
    // Python's dot and line anchors use LF as the line separator, even where
    // Unicode classifies other characters as line breaks.
    c == 10
}
fn in_ranges(c: u32, ranges: &[(u32, u32)]) -> bool {
    ranges
        .binary_search_by(|(a, b)| {
            if c < *a {
                std::cmp::Ordering::Greater
            } else if c > *b {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Equal
            }
        })
        .is_ok()
}
fn is_word(c: u32, flags: Flags, version: PythonReVersion) -> bool {
    if c == 95 {
        return true;
    }
    if flags.has(Flags::ASCII) {
        return c <= 127 && (c as u8).is_ascii_alphanumeric();
    }
    let r = match version {
        PythonReVersion::V3_11 => tables::WORD_V3_11,
        PythonReVersion::V3_12 => tables::WORD_V3_12,
        PythonReVersion::V3_13 => tables::WORD_V3_13,
    };
    in_ranges(c, r)
}
fn decimal_digit(c: u32, version: PythonReVersion) -> Option<u32> {
    let ranges = match version {
        PythonReVersion::V3_11 => tables::DIGIT_V3_11,
        PythonReVersion::V3_12 => tables::DIGIT_V3_12,
        PythonReVersion::V3_13 => tables::DIGIT_V3_13,
    };
    ranges
        .binary_search_by(|(start, end)| {
            if c < *start {
                std::cmp::Ordering::Greater
            } else if c > *end {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Equal
            }
        })
        .ok()
        .map(|index| (c - ranges[index].0) % 10)
}
fn parse_conditional_group_number(name: &str, version: PythonReVersion) -> Option<usize> {
    if !name.is_empty() && name.bytes().all(|byte| byte.is_ascii_digit()) {
        return name.parse::<usize>().ok();
    }
    // CPython 3.11 accepted decimal spellings accepted by int(), though it
    // warned about them. 3.12 made those spellings an error.
    if version != PythonReVersion::V3_11 {
        return None;
    }
    let digits = name.trim().strip_prefix('+').unwrap_or(name.trim());
    if digits.is_empty() {
        return None;
    }
    digits.chars().try_fold(0usize, |number, ch| {
        let digit = decimal_digit(ch as u32, version)? as usize;
        number.checked_mul(10)?.checked_add(digit)
    })
}
fn is_digit(c: u32, flags: Flags, version: PythonReVersion) -> bool {
    if flags.has(Flags::ASCII) {
        return c <= 127 && (c as u8).is_ascii_digit();
    }
    let r = match version {
        PythonReVersion::V3_11 => tables::DIGIT_V3_11,
        PythonReVersion::V3_12 => tables::DIGIT_V3_12,
        PythonReVersion::V3_13 => tables::DIGIT_V3_13,
    };
    in_ranges(c, r)
}
fn is_space(c: u32, flags: Flags, version: PythonReVersion) -> bool {
    if flags.has(Flags::ASCII) {
        return matches!(c, 9..=13 | 32);
    }
    let r = match version {
        PythonReVersion::V3_11 => tables::SPACE_V3_11,
        PythonReVersion::V3_12 => tables::SPACE_V3_12,
        PythonReVersion::V3_13 => tables::SPACE_V3_13,
    };
    in_ranges(c, r)
}
fn valid_group_name(name: &str, version: PythonReVersion) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    let (start, cont) = match version {
        PythonReVersion::V3_11 => (tables::IDSTART_V3_11, tables::IDCONTINUE_V3_11),
        PythonReVersion::V3_12 => (tables::IDSTART_V3_12, tables::IDCONTINUE_V3_12),
        PythonReVersion::V3_13 => (tables::IDSTART_V3_13, tables::IDCONTINUE_V3_13),
    };
    in_ranges(first as u32, start) && chars.all(|ch| in_ranges(ch as u32, cont))
}
fn class_matches(
    class: &Class,
    c: u32,
    flags: Flags,
    v: PythonReVersion,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(class.atoms.len(), Utf16::default())?;
    for atom in &class.atoms {
        let matched = match atom {
            ClassAtom::Char(x) => eq_char(*x, c, flags, v, ctx)?,
            ClassAtom::Range(a, b) => range_matches(*a, *b, c, flags, v, ctx)?,
            ClassAtom::Category(cat, neg) => {
                let yes = match cat {
                    Category::Digit => is_digit(c, flags, v),
                    Category::Space => is_space(c, flags, v),
                    Category::Word => is_word(c, flags, v),
                };
                yes != *neg
            }
        };
        if matched {
            return Ok(!class.negated);
        }
    }
    Ok(class.negated)
}
fn eq_char(
    a: u32,
    b: u32,
    f: Flags,
    v: PythonReVersion,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if a == b {
        return Ok(true);
    }
    if !f.has(Flags::IGNORECASE) {
        return Ok(false);
    }
    ctx.charge_work(1, Utf16::default())?;
    let folded_a = fold_char(a, f, v);
    let folded_b = fold_char(b, f, v);
    if !f.has(Flags::ASCII) {
        ctx.charge_work(16, Utf16::default())?;
    }
    Ok(folded_a == folded_b
        || (!f.has(Flags::ASCII) && casefix_equivalent(a, b, folded_a, folded_b, v)))
}
// CPython applies the Unicode `_casefix` extras while compiling literal and
// character-set instructions. Backreferences use the runtime lower-case
// comparison only, so they intentionally do not use those extra pairs.
fn eq_backreference_char(a: u32, b: u32, f: Flags, v: PythonReVersion) -> bool {
    a == b || (f.has(Flags::IGNORECASE) && fold_char(a, f, v) == fold_char(b, f, v))
}
fn fold_char(c: u32, flags: Flags, version: PythonReVersion) -> u32 {
    if flags.has(Flags::ASCII) {
        if c <= 127 {
            (c as u8).to_ascii_lowercase() as u32
        } else {
            c
        }
    } else {
        simple_fold(c, version)
    }
}
fn simple_fold(c: u32, v: PythonReVersion) -> u32 {
    let pairs = match v {
        PythonReVersion::V3_11 => tables::LOWER_V3_11,
        PythonReVersion::V3_12 => tables::LOWER_V3_12,
        PythonReVersion::V3_13 => tables::LOWER_V3_13,
    };
    pairs
        .binary_search_by_key(&c, |p| p.0)
        .map_or(c, |i| pairs[i].1)
}
fn lower_reverse(v: PythonReVersion) -> &'static [(u32, u32)] {
    match v {
        PythonReVersion::V3_11 => tables::LOWER_REVERSE_V3_11,
        PythonReVersion::V3_12 => tables::LOWER_REVERSE_V3_12,
        PythonReVersion::V3_13 => tables::LOWER_REVERSE_V3_13,
    }
}
fn casefix(v: PythonReVersion) -> &'static [(u32, u32)] {
    match v {
        PythonReVersion::V3_11 => tables::CASEFIX_V3_11,
        PythonReVersion::V3_12 => tables::CASEFIX_V3_12,
        PythonReVersion::V3_13 => tables::CASEFIX_V3_13,
    }
}
fn casefix_reverse(v: PythonReVersion) -> &'static [(u32, u32)] {
    match v {
        PythonReVersion::V3_11 => tables::CASEFIX_REVERSE_V3_11,
        PythonReVersion::V3_12 => tables::CASEFIX_REVERSE_V3_12,
        PythonReVersion::V3_13 => tables::CASEFIX_REVERSE_V3_13,
    }
}
fn has_pair(pairs: &[(u32, u32)], left: u32, right: u32) -> bool {
    pairs.binary_search(&(left, right)).is_ok()
}
fn pair_group<'a>(pairs: &'a [(u32, u32)], key: u32) -> &'a [(u32, u32)] {
    let first = pairs.partition_point(|(item, _)| *item < key);
    let end = pairs.partition_point(|(item, _)| *item <= key);
    &pairs[first..end]
}
fn casefix_equivalent(a: u32, b: u32, folded_a: u32, folded_b: u32, v: PythonReVersion) -> bool {
    let forward = casefix(v);
    let reverse = casefix_reverse(v);
    has_pair(forward, a, b)
        || has_pair(forward, b, a)
        || pair_group(forward, a)
            .iter()
            .any(|(_, other)| simple_fold(*other, v) == folded_b)
        || pair_group(reverse, a)
            .iter()
            .any(|(_, other)| simple_fold(*other, v) == folded_b)
        || pair_group(forward, b)
            .iter()
            .any(|(_, other)| simple_fold(*other, v) == folded_a)
        || pair_group(reverse, b)
            .iter()
            .any(|(_, other)| simple_fold(*other, v) == folded_a)
}
fn range_matches(
    a: u32,
    b: u32,
    c: u32,
    flags: Flags,
    v: PythonReVersion,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if (a..=b).contains(&c) || !flags.has(Flags::IGNORECASE) {
        return Ok((a..=b).contains(&c));
    }
    ctx.charge_work(1, Utf16::default())?;
    if flags.has(Flags::ASCII) {
        let folded = fold_char(c, flags, v);
        return range_contains_lower_class_member(a, b, folded, v, true, ctx);
    }
    let folded = fold_char(c, flags, v);
    if range_contains_lower_class_member(a, b, folded, v, false, ctx)? {
        return Ok(true);
    }
    for key in [folded, c] {
        let forward = pair_group(casefix(v), key);
        let reverse = pair_group(casefix_reverse(v), key);
        ctx.charge_work(
            forward.len().saturating_add(reverse.len()),
            Utf16::default(),
        )?;
        for (_, member) in forward.iter().chain(reverse.iter()) {
            if range_contains_lower_class_member(a, b, simple_fold(*member, v), v, false, ctx)? {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
fn range_contains_lower_class_member(
    a: u32,
    b: u32,
    lower: u32,
    v: PythonReVersion,
    ascii: bool,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if (a..=b).contains(&lower) {
        return Ok(true);
    }
    let reverse = pair_group(lower_reverse(v), lower);
    ctx.charge_work(reverse.len(), Utf16::default())?;
    Ok(reverse
        .iter()
        .any(|(_, source)| (!ascii || *source <= 0x7f) && (a..=b).contains(source)))
}
fn anchor_matches(a: Anchor, f: Flags, text: &[u32], pos: usize, v: PythonReVersion) -> bool {
    match a {
        Anchor::AbsoluteBeginning => pos == 0,
        Anchor::AbsoluteEnd => pos == text.len(),
        Anchor::Beginning => {
            pos == 0 || (f.has(Flags::MULTILINE) && pos > 0 && text[pos - 1] == 10)
        }
        Anchor::End => {
            pos == text.len()
                || (pos + 1 == text.len() && text.get(pos) == Some(&10))
                || (f.has(Flags::MULTILINE) && text.get(pos) == Some(&10))
        }
        Anchor::Boundary(neg) => {
            if neg && text.is_empty() {
                return false;
            }
            let left = pos > 0 && is_word(text[pos - 1], f, v);
            let right = pos < text.len() && is_word(text[pos], f, v);
            (left != right) != neg
        }
    }
}

struct Parser<'ctx, 'host> {
    chars: Vec<u32>,
    pos: usize,
    version: PythonReVersion,
    flags: Flags,
    group_names: BTreeMap<String, usize>,
    open_groups: Vec<usize>,
    lookbehind_group_limits: Vec<usize>,
    global_flags_allowed: bool,
    pending_conditionals: Vec<usize>,
    group_widths: Vec<Option<usize>>,
    groups: usize,
    next_repeat: usize,
    ctx: &'ctx mut Context<'host>,
}
#[derive(Clone, Copy)]
enum GroupKind {
    Root,
    Plain,
    Capture(usize),
    Atomic,
    Look { positive: bool, behind: bool },
    Conditional(usize),
}
struct ParseFrame {
    kind: GroupKind,
    saved_flags: Flags,
    seq: Vec<Node>,
    alts: Vec<Node>,
}
impl ParseFrame {
    fn new(kind: GroupKind, saved_flags: Flags) -> Self {
        Self {
            kind,
            saved_flags,
            seq: Vec::new(),
            alts: Vec::new(),
        }
    }
    fn take_seq(&mut self) -> Node {
        let mut nodes = std::mem::take(&mut self.seq);
        match nodes.len() {
            0 => Node::Empty,
            1 => nodes.remove(0),
            _ => Node::Seq(nodes),
        }
    }
}
enum OpenResult {
    Frame(GroupKind, Flags),
    Atom(Node),
    Ignored,
}
impl<'ctx, 'host> Parser<'ctx, 'host> {
    fn new(chars: Vec<u32>, version: PythonReVersion, ctx: &'ctx mut Context<'host>) -> Self {
        Self {
            chars,
            pos: 0,
            version,
            flags: Flags::default(),
            group_names: BTreeMap::new(),
            open_groups: Vec::new(),
            lookbehind_group_limits: Vec::new(),
            global_flags_allowed: true,
            pending_conditionals: Vec::new(),
            group_widths: vec![Some(0)],
            groups: 0,
            next_repeat: 0,
            ctx,
        }
    }
    fn parse(&mut self) -> Result<(Node, usize, Flags), PythonRegexError> {
        let flags = self.parse_global_flags()?;
        let mut frames = vec![ParseFrame::new(GroupKind::Root, self.flags)];
        loop {
            self.skip_verbose();
            match self.peek() {
                Some(40) => {
                    self.pop();
                    match self.open_group()? {
                        OpenResult::Frame(kind, saved_flags) => {
                            self.global_flags_allowed = false;
                            if matches!(kind, GroupKind::Look { behind: true, .. }) {
                                self.lookbehind_group_limits.push(self.groups);
                            }
                            if frames.len() > 495 {
                                return Err(self.err("maximum parse nesting exceeded"));
                            }
                            frames.push(ParseFrame::new(kind, saved_flags));
                        }
                        OpenResult::Atom(node) => {
                            self.global_flags_allowed = false;
                            let node = self.parse_quantifier(node)?;
                            frames.last_mut().expect("root frame").seq.push(node);
                        }
                        OpenResult::Ignored => {}
                    }
                }
                Some(124) => {
                    if matches!(
                        frames.last().map(|frame| frame.kind),
                        Some(GroupKind::Conditional(_))
                    ) && !frames.last().expect("conditional frame").alts.is_empty()
                    {
                        return Err(self.err("conditional group has more than two branches"));
                    }
                    self.pop();
                    let frame = frames.last_mut().expect("root frame");
                    let seq = frame.take_seq();
                    frame.alts.push(seq);
                }
                Some(41) => {
                    if frames.len() == 1 {
                        return Err(self.err("unbalanced parenthesis"));
                    }
                    self.pop();
                    let mut frame = frames.pop().expect("nested frame");
                    let node = self.finish_frame(&mut frame)?;
                    if matches!(frame.kind, GroupKind::Look { behind: true, .. }) {
                        self.lookbehind_group_limits.pop();
                    }
                    self.flags = frame.saved_flags;
                    let node = self.parse_quantifier(node)?;
                    frames.last_mut().expect("parent frame").seq.push(node);
                }
                None => {
                    if frames.len() != 1 {
                        return Err(self.err("unbalanced parenthesis"));
                    }
                    let mut root = frames.pop().expect("root frame");
                    let node = self.finish_frame(&mut root)?;
                    self.charge_parser_work(self.pending_conditionals.len())?;
                    if self
                        .pending_conditionals
                        .iter()
                        .any(|index| *index > self.groups)
                    {
                        return Err(self.err("invalid group reference"));
                    }
                    return Ok((node, self.groups, flags));
                }
                _ => {
                    self.global_flags_allowed = false;
                    let atom = self.parse_atom()?;
                    let node = self.parse_quantifier(atom)?;
                    frames.last_mut().expect("root frame").seq.push(node);
                }
            }
        }
    }

    fn skip_verbose(&mut self) {
        while self.flags.has(Flags::VERBOSE) {
            if self.peek() == Some(35) {
                while self.peek().is_some_and(|c| c != 10) {
                    self.pop();
                }
            } else if self
                .peek()
                .is_some_and(|c| matches!(c, 9 | 10 | 11 | 12 | 13 | 32))
            {
                self.pop();
            } else {
                break;
            }
        }
    }

    fn finish_frame(&mut self, frame: &mut ParseFrame) -> Result<Node, PythonRegexError> {
        let last = frame.take_seq();
        match frame.kind {
            GroupKind::Conditional(index) => {
                let (yes, no) = match frame.alts.len() {
                    0 => (last, Node::Empty),
                    1 => (frame.alts.remove(0), last),
                    _ => return Err(self.err("conditional group has more than two branches")),
                };
                Ok(Node::Conditional {
                    index,
                    yes: Box::new(yes),
                    no: Box::new(no),
                })
            }
            kind => {
                frame.alts.push(last);
                let inner = if frame.alts.len() == 1 {
                    frame.alts.remove(0)
                } else {
                    Node::Alt(std::mem::take(&mut frame.alts))
                };
                match kind {
                    GroupKind::Root | GroupKind::Plain => Ok(inner),
                    GroupKind::Capture(index) => {
                        self.group_widths[index] = self.width_of(&inner)?;
                        self.open_groups.pop();
                        Ok(Node::Group {
                            index,
                            node: Box::new(inner),
                        })
                    }
                    GroupKind::Atomic => Ok(Node::Atomic(Box::new(inner))),
                    GroupKind::Look { positive, behind } => {
                        let width = if behind { self.width_of(&inner)? } else { None };
                        if behind && width.is_none() {
                            return Err(self.err("look-behind requires fixed-width pattern"));
                        }
                        Ok(Node::Look {
                            node: Arc::new(inner),
                            positive,
                            behind,
                            width,
                        })
                    }
                    GroupKind::Conditional(_) => unreachable!(),
                }
            }
        }
    }

    fn open_group(&mut self) -> Result<OpenResult, PythonRegexError> {
        let saved = self.flags;
        if self.peek() != Some(63) {
            return Ok(OpenResult::Frame(self.open_capture(None)?, saved));
        }
        self.pop();
        match self.pop() {
            Some(35) => {
                while self.peek() != Some(41) {
                    if self.pop().is_none() {
                        return Err(self.err("unterminated comment"));
                    }
                }
                self.pop();
                Ok(OpenResult::Ignored)
            }
            Some(58) => Ok(OpenResult::Frame(GroupKind::Plain, saved)),
            Some(62) => Ok(OpenResult::Frame(GroupKind::Atomic, saved)),
            Some(61) => Ok(OpenResult::Frame(
                GroupKind::Look {
                    positive: true,
                    behind: false,
                },
                saved,
            )),
            Some(33) => Ok(OpenResult::Frame(
                GroupKind::Look {
                    positive: false,
                    behind: false,
                },
                saved,
            )),
            Some(60) => match self.pop() {
                Some(61) => Ok(OpenResult::Frame(
                    GroupKind::Look {
                        positive: true,
                        behind: true,
                    },
                    saved,
                )),
                Some(33) => Ok(OpenResult::Frame(
                    GroupKind::Look {
                        positive: false,
                        behind: true,
                    },
                    saved,
                )),
                Some(first) => Err(PythonRegexError::syntax(
                    format!(
                        "unknown extension ?<{}",
                        char::from_u32(first).unwrap_or('?')
                    ),
                    self.pos.saturating_sub(2),
                )),
                None => Err(self.err("unterminated group extension")),
            },
            Some(80) => match self.pop() {
                Some(60) => {
                    let name = self.take_until(62)?;
                    let kind = self.open_capture(Some(name))?;
                    Ok(OpenResult::Frame(kind, saved))
                }
                Some(61) => {
                    let name = self.take_until(41)?;
                    self.charge_name_work(name.len())?;
                    let index = self
                        .group_names
                        .get(&name)
                        .copied()
                        .ok_or_else(|| self.err("unknown group name"))?;
                    self.charge_parser_work(self.open_groups.len())?;
                    if self.open_groups.contains(&index) {
                        return Err(self.err("cannot refer to an open group"));
                    }
                    if self
                        .lookbehind_group_limits
                        .last()
                        .is_some_and(|limit| index > *limit)
                    {
                        return Err(self.err(
                            "cannot refer to group defined in the same look-behind subpattern",
                        ));
                    }
                    Ok(OpenResult::Atom(Node::Backref {
                        index,
                        flags: self.flags,
                        width: self.group_widths.get(index).copied().flatten(),
                    }))
                }
                _ => Err(self.err("malformed named group extension")),
            },
            Some(40) => {
                let name = self.take_until(41)?;
                let index = if let Some(index) = parse_conditional_group_number(&name, self.version)
                {
                    if index == 0 {
                        return Err(self.err("invalid group reference"));
                    }
                    if index > self.groups {
                        self.charge_parser_work(self.pending_conditionals.len())?;
                        self.pending_conditionals.push(index);
                    }
                    index
                } else {
                    self.charge_name_work(name.len())?;
                    self.group_names
                        .get(&name)
                        .copied()
                        .ok_or_else(|| self.err("unknown conditional group"))?
                };
                if self
                    .lookbehind_group_limits
                    .last()
                    .is_some_and(|limit| index > *limit)
                {
                    return Err(self
                        .err("cannot refer to group defined in the same look-behind subpattern"));
                }
                Ok(OpenResult::Frame(GroupKind::Conditional(index), saved))
            }
            Some(c @ (105 | 109 | 115 | 120 | 97 | 117 | 116)) | Some(c @ 45) => {
                let mut on = Vec::new();
                let mut off = Vec::new();
                let mut disable = c == 45;
                if !disable {
                    on.push(c);
                }
                loop {
                    match self.pop() {
                        Some(45) if !disable => disable = true,
                        Some(45) => {
                            return Err(self.err("bad inline flags: flag turned on and off"))
                        }
                        Some(58) => {
                            self.global_flags_allowed = false;
                            if on.contains(&116) || off.contains(&116) {
                                return Err(self.err("bad inline flags: cannot scope global flag"));
                            }
                            if on.contains(&97) && on.contains(&117) {
                                return Err(self.err("ASCII and UNICODE flags are incompatible"));
                            }
                            break;
                        }
                        Some(41) => {
                            if disable || !self.global_flags_allowed {
                                return Err(
                                    self.err("global flags not at the start of the expression")
                                );
                            }
                            if self.version == PythonReVersion::V3_13 && on.contains(&116) {
                                return Err(self.err("invalid global flag"));
                            }
                            if (saved.has(Flags::ASCII) && on.contains(&117))
                                || (saved.has(Flags::UNICODE) && on.contains(&97))
                            {
                                return Err(self.err("ASCII and UNICODE flags are incompatible"));
                            }
                            self.flags = self.flags_from(saved, &on, &off);
                            if self.flags.has(Flags::ASCII) && self.flags.has(Flags::UNICODE) {
                                return Err(self.err("ASCII and UNICODE flags are incompatible"));
                            }
                            return Ok(OpenResult::Ignored);
                        }
                        Some(x) if matches!(x, 105 | 109 | 115 | 120 | 97 | 117 | 116) => {
                            if disable {
                                off.push(x)
                            } else {
                                on.push(x)
                            }
                        }
                        _ => return Err(self.err("invalid inline flags")),
                    }
                }
                if on.iter().any(|flag| off.contains(flag)) {
                    return Err(self.err("bad inline flags: flag turned on and off"));
                }
                if off.iter().any(|flag| matches!(*flag, 97 | 117)) {
                    return Err(self.err("bad inline flags: cannot turn off a or u"));
                }
                self.flags = self.flags_from(saved, &on, &off);
                if self.flags.has(Flags::ASCII) && self.flags.has(Flags::UNICODE) {
                    return Err(self.err("ASCII and UNICODE flags are incompatible"));
                }
                Ok(OpenResult::Frame(GroupKind::Plain, saved))
            }
            _ => Err(self.err("unsupported or malformed group extension")),
        }
    }

    fn open_capture(&mut self, name: Option<String>) -> Result<GroupKind, PythonRegexError> {
        if name
            .as_ref()
            .is_some_and(|name| !valid_group_name(name, self.version))
        {
            return Err(self.err("bad character in group name"));
        }
        if let Some(name) = name.as_ref() {
            self.charge_name_work(name.len())?;
            if self.group_names.contains_key(name) {
                return Err(self.err("redefinition of group name"));
            }
        }
        self.groups += 1;
        let index = self.groups;
        self.group_widths.push(None);
        if let Some(name) = name {
            self.charge_name_work(name.len())?;
            self.group_names.insert(name, index);
        }
        self.open_groups.push(index);
        Ok(GroupKind::Capture(index))
    }
    fn err(&self, s: &str) -> PythonRegexError {
        PythonRegexError::syntax(s, self.pos)
    }
    fn width_of(&mut self, node: &Node) -> Result<Option<usize>, PythonRegexError> {
        fixed_width(node, self.ctx).map_err(|error| PythonRegexError::resource(error, self.pos))
    }
    fn charge_parser_work(&mut self, amount: usize) -> Result<(), PythonRegexError> {
        self.ctx
            .charge_work(amount, Utf16::default())
            .map_err(|error| PythonRegexError::resource(error, self.pos))
    }
    fn charge_name_work(&mut self, name_bytes: usize) -> Result<(), PythonRegexError> {
        let entries = self.group_names.len() as u64;
        let log_bound = if entries == 0 {
            0
        } else {
            (u64::BITS - entries.leading_zeros()) as u64 + 1
        };
        // BTreeMap nodes linearly scan up to 11 keys (B=6) at each level.
        // Account for those key comparisons and their shared-prefix scans,
        // not only the number of tree levels.
        let comparisons = entries.min(11u64.saturating_mul(log_bound));
        self.ctx
            .charge_work_u64(
                (name_bytes as u64).saturating_mul(comparisons),
                Utf16::default(),
            )
            .map_err(|error| PythonRegexError::resource(error, self.pos))
    }
    fn peek(&self) -> Option<u32> {
        self.chars.get(self.pos).copied()
    }
    fn pop(&mut self) -> Option<u32> {
        let c = self.peek()?;
        self.pos += 1;
        Some(c)
    }
    fn parse_global_flags(&mut self) -> Result<Flags, PythonRegexError> {
        if self.chars.get(0..2) == Some(&[40, 63]) {
            let mut end = 2;
            while end < self.chars.len() && self.chars[end] != 41 {
                end += 1
            }
            if end < self.chars.len() {
                let spec = self.chars[2..end].to_vec();
                if !spec.is_empty()
                    && spec
                        .iter()
                        .all(|c| matches!(*c, 105 | 109 | 115 | 120 | 97 | 117 | 116))
                {
                    if self.version == PythonReVersion::V3_13 && spec.contains(&116) {
                        return Err(self.err("invalid global flag"));
                    }
                    for c in spec {
                        self.setflag(c, true)
                    }
                    if self.flags.has(Flags::ASCII) && self.flags.has(Flags::UNICODE) {
                        return Err(self.err("ASCII and UNICODE flags are incompatible"));
                    }
                    self.pos = end + 1;
                }
            }
        }
        Ok(self.flags)
    }
    fn setflag(&mut self, c: u32, on: bool) {
        let bit = match c {
            105 => Flags::IGNORECASE,
            109 => Flags::MULTILINE,
            115 => Flags::DOTALL,
            120 => Flags::VERBOSE,
            97 => Flags::ASCII,
            117 => Flags::UNICODE,
            116 => Flags::TEMPLATE,
            _ => 0,
        };
        if on {
            self.flags.0 |= bit
        } else {
            self.flags.0 &= !bit
        }
    }
    fn parse_atom(&mut self) -> Result<Node, PythonRegexError> {
        let c = self.pop().ok_or_else(|| self.err("unexpected end"))?;
        let f = self.flags;
        match c {
            46 => Ok(Node::Any(f)),
            94 => Ok(Node::Anchor(Anchor::Beginning, f)),
            36 => Ok(Node::Anchor(Anchor::End, f)),
            91 => Ok(Node::Class(self.parse_class()?, f)),
            40 => Err(self.err("internal parser error: group opener was not framed")),
            92 => self.parse_escape(false),
            42 | 43 | 63 => Err(self.err("quantifier does not follow a repeatable item")),
            _ => Ok(Node::Literal(c, f)),
        }
    }
    fn flags_from(&self, base: Flags, on: &[u32], off: &[u32]) -> Flags {
        let mut x = base;
        for c in on {
            if *c == 97 {
                x.0 &= !Flags::UNICODE;
            }
            if *c == 117 {
                x.0 &= !Flags::ASCII;
            }
            let b = match c {
                105 => 1,
                109 => 4,
                115 => 2,
                120 => 16,
                97 => 8,
                117 => 32,
                116 => 64,
                _ => 0,
            };
            x.0 |= b
        }
        for c in off {
            let b = match c {
                105 => 1,
                109 => 4,
                115 => 2,
                120 => 16,
                97 => 8,
                117 => 32,
                116 => 64,
                _ => 0,
            };
            x.0 &= !b
        }
        x
    }
    fn take_until(&mut self, end: u32) -> Result<String, PythonRegexError> {
        let start = self.pos;
        while self.peek() != Some(end) {
            if self.pop().is_none() {
                return Err(self.err("unterminated group extension"));
            }
        }
        let mut s = String::new();
        for &codepoint in &self.chars[start..self.pos] {
            let Some(ch) = char::from_u32(codepoint) else {
                return Err(self.err("group name must contain Unicode identifier characters"));
            };
            s.push(ch);
        }
        self.pop();
        Ok(s)
    }
    fn parse_quantifier(&mut self, n: Node) -> Result<Node, PythonRegexError> {
        if self.version != PythonReVersion::V3_13
            && self.flags.has(Flags::TEMPLATE)
            && matches!(self.peek(), Some(42 | 43 | 63 | 123))
        {
            return Err(self.err("internal: unsupported template operator MAX_REPEAT"));
        }
        if matches!(self.peek(), Some(42 | 43 | 63 | 123))
            && matches!(&n, Node::Empty | Node::Anchor(..))
        {
            return Err(self.err("nothing to repeat"));
        }
        let (min, max) = match self.peek() {
            Some(42) => {
                self.pop();
                (0, None)
            }
            Some(43) => {
                self.pop();
                (1, None)
            }
            Some(63) => {
                self.pop();
                (0, Some(1))
            }
            Some(123) => {
                let save = self.pos;
                self.pop();
                let a = self.read_num()?;
                if a.is_none() {
                    self.pos = save;
                    return Ok(n);
                }
                let min = a.unwrap();
                let max = if self.peek() == Some(44) {
                    self.pop();
                    self.read_num()?
                } else {
                    Some(min)
                };
                if self.pop() != Some(125) {
                    self.pos = save;
                    return Ok(n);
                }
                if max.is_some_and(|x| x < min) {
                    return Err(self.err("min repeat greater than max repeat"));
                }
                (min, max)
            }
            _ => return Ok(n),
        };
        let greedy = if self.peek() == Some(63) {
            self.pop();
            false
        } else {
            true
        };
        let possessive = if self.peek() == Some(43) {
            self.pop();
            true
        } else {
            false
        };
        let id = self.next_repeat;
        self.next_repeat += 1;
        let repeat = Node::Repeat {
            node: Box::new(n),
            min,
            max,
            greedy,
            id,
        };
        Ok(if possessive {
            Node::Atomic(Box::new(repeat))
        } else {
            repeat
        })
    }
    fn read_num(&mut self) -> Result<Option<u64>, PythonRegexError> {
        let start = self.pos;
        let mut n = 0u64;
        let mut overflow = false;
        while let Some(c) = self.peek() {
            if !(48..=57).contains(&c) {
                break;
            }
            self.pop();
            if let Some(x) = n
                .checked_mul(10)
                .and_then(|x| x.checked_add((c - 48) as u64))
            {
                n = x
            } else {
                overflow = true
            }
        }
        if self.pos == start {
            return Ok(None);
        }
        if overflow || n >= u32::MAX as u64 {
            return Err(self.err("the repetition number is too large"));
        }
        Ok(Some(n))
    }
    fn parse_escape(&mut self, in_class: bool) -> Result<Node, PythonRegexError> {
        let c = self.pop().ok_or_else(|| self.err("trailing escape"))?;
        let f = self.flags;
        if (48..=57).contains(&c) {
            if c == 48 || in_class {
                if c > 55 {
                    return Err(self.err("bad octal escape"));
                }
                let mut n = c - 48;
                let mut count = 1;
                while count < 3 && self.peek().is_some_and(|x| (48..=55).contains(&x)) {
                    n = n * 8 + (self.pop().unwrap() - 48);
                    count += 1;
                }
                if n > 255 {
                    return Err(self.err("octal escape value outside of range 0-0o377"));
                }
                return Ok(Node::Literal(n, f));
            }
            if c <= 55
                && self
                    .chars
                    .get(self.pos..self.pos + 2)
                    .is_some_and(|d| d.iter().all(|x| (48..=55).contains(x)))
            {
                let n = (c - 48) * 64 + (self.pop().unwrap() - 48) * 8 + (self.pop().unwrap() - 48);
                if n > 255 {
                    return Err(self.err("octal escape value outside of range 0-0o377"));
                }
                return Ok(Node::Literal(n, f));
            }
            let mut index = (c - 48) as usize;
            if self.peek().is_some_and(|x| (48..=57).contains(&x)) {
                index = index * 10 + (self.pop().unwrap() - 48) as usize;
            }
            if index == 0 || index > self.groups {
                return Err(self.err("invalid group reference"));
            }
            if self.open_groups.contains(&index) {
                return Err(self.err("cannot refer to an open group"));
            }
            if self
                .lookbehind_group_limits
                .last()
                .is_some_and(|limit| index > *limit)
            {
                return Err(
                    self.err("cannot refer to group defined in the same look-behind subpattern")
                );
            }
            return Ok(Node::Backref {
                index,
                flags: f,
                width: self.group_widths.get(index).copied().flatten(),
            });
        }
        let node = match c {
            100 => Node::Class(singlecat(Category::Digit, false), f),
            68 => Node::Class(singlecat(Category::Digit, true), f),
            115 => Node::Class(singlecat(Category::Space, false), f),
            83 => Node::Class(singlecat(Category::Space, true), f),
            119 => Node::Class(singlecat(Category::Word, false), f),
            87 => Node::Class(singlecat(Category::Word, true), f),
            65 => Node::Anchor(Anchor::AbsoluteBeginning, f),
            90 => Node::Anchor(Anchor::AbsoluteEnd, f),
            98 if !in_class => Node::Anchor(Anchor::Boundary(false), f),
            66 if !in_class => Node::Anchor(Anchor::Boundary(true), f),
            98 => Node::Literal(8, f),
            110 => Node::Literal(10, f),
            114 => Node::Literal(13, f),
            116 => Node::Literal(9, f),
            102 => Node::Literal(12, f),
            118 => Node::Literal(11, f),
            97 => Node::Literal(7, f),
            120 => Node::Literal(self.read_hex(2)?, f),
            117 => Node::Literal(self.read_hex(4)?, f),
            85 => Node::Literal(self.read_hex(8)?, f),
            78 => Node::Literal(self.read_named_char()?, f),
            _ if c <= 127 && (c as u8).is_ascii_alphabetic() => return Err(self.err("bad escape")),
            _ => Node::Literal(c, f),
        };
        Ok(node)
    }
    fn read_hex(&mut self, n: usize) -> Result<u32, PythonRegexError> {
        let mut v = 0u32;
        for _ in 0..n {
            let c = self.pop().ok_or_else(|| self.err("incomplete escape"))?;
            let d = match c {
                0x30..=0x39 => c - 0x30,
                0x41..=0x46 => c - 0x41 + 10,
                0x61..=0x66 => c - 0x61 + 10,
                _ => return Err(self.err("incomplete escape")),
            };
            v = v
                .checked_mul(16)
                .and_then(|x| x.checked_add(d))
                .ok_or_else(|| self.err("escape out of range"))?;
        }
        if v > 0x10ffff {
            return Err(self.err("escape out of range"));
        }
        Ok(v)
    }
    fn read_named_char(&mut self) -> Result<u32, PythonRegexError> {
        if self.pop() != Some(123) {
            return Err(self.err("missing { in character name"));
        }
        let start = self.pos;
        while self.peek() != Some(125) {
            if self.pop().is_none() {
                return Err(self.err("missing } in character name"));
            }
        }
        if start == self.pos {
            return Err(self.err("empty character name"));
        }
        let mut name = Vec::with_capacity(self.pos - start);
        for &c in &self.chars[start..self.pos] {
            if c > 0x7f {
                return Err(self.err("character name must be ASCII"));
            }
            let b = c as u8;
            name.push(if b.is_ascii_lowercase() {
                b.to_ascii_uppercase()
            } else {
                b
            });
        }
        self.pop();
        lookup_unicode_name(&name, self.version, self.ctx)
            .map_err(|error| PythonRegexError::resource(error, self.pos))?
            .ok_or_else(|| self.err("unknown Unicode character name"))
    }
    fn parse_class(&mut self) -> Result<Class, PythonRegexError> {
        let negated = if self.peek() == Some(94) {
            self.pop();
            true
        } else {
            false
        };
        let mut atoms = Vec::new();
        let mut first = true;
        while let Some(c) = self.pop() {
            if c == 93 && !first {
                return Ok(Class { negated, atoms });
            }
            if c == 45
                && (first
                    || self.peek() == Some(93)
                    || matches!(atoms.last(), Some(ClassAtom::Range(..))))
            {
                atoms.push(ClassAtom::Char(45));
                first = false;
                continue;
            }
            first = false;
            let left = if c == 92 {
                Self::class_escape(self.parse_escape(true)?, self)?
            } else {
                vec![ClassAtom::Char(c)]
            };
            if self.peek() == Some(45)
                && self.chars.get(self.pos + 1).is_some_and(|next| *next != 93)
            {
                self.pop();
                let right_c = self
                    .pop()
                    .ok_or_else(|| self.err("unterminated character set"))?;
                let right = if right_c == 92 {
                    Self::class_escape(self.parse_escape(true)?, self)?
                } else {
                    vec![ClassAtom::Char(right_c)]
                };
                match (left.as_slice(), right.as_slice()) {
                    ([ClassAtom::Char(start)], [ClassAtom::Char(end)]) => {
                        if end < start {
                            return Err(self.err("bad character range"));
                        }
                        atoms.push(ClassAtom::Range(*start, *end));
                    }
                    _ => return Err(self.err("bad character range")),
                }
            } else {
                atoms.extend(left);
            }
        }
        Err(self.err("unterminated character set"))
    }
    fn class_escape(node: Node, parser: &Self) -> Result<Vec<ClassAtom>, PythonRegexError> {
        match node {
            Node::Literal(c, _) => Ok(vec![ClassAtom::Char(c)]),
            Node::Class(c, _) => Ok(c.atoms),
            _ => Err(parser.err("invalid escape in character set")),
        }
    }
}
fn singlecat(c: Category, n: bool) -> Class {
    Class {
        negated: false,
        atoms: vec![ClassAtom::Category(c, n)],
    }
}
fn fixed_width(root: &Node, ctx: &mut Context<'_>) -> Result<Option<usize>, EngineError> {
    enum Task<'a> {
        Visit(&'a Node),
        Finish(&'a Node),
    }
    ctx.charge_work(1, Utf16::default())?;
    let mut tasks = vec![Task::Visit(root)];
    let mut widths: Vec<Option<usize>> = Vec::new();
    while let Some(task) = tasks.pop() {
        match task {
            Task::Visit(node) => {
                ctx.charge_work(2, Utf16::default())?;
                tasks.push(Task::Finish(node));
                match node {
                    Node::Seq(nodes) | Node::Alt(nodes) => {
                        ctx.charge_work(nodes.len(), Utf16::default())?;
                        tasks.extend(nodes.iter().rev().map(Task::Visit));
                    }
                    Node::Conditional { yes, no, .. } => {
                        ctx.charge_work(2, Utf16::default())?;
                        tasks.push(Task::Visit(no));
                        tasks.push(Task::Visit(yes));
                    }
                    Node::Repeat { node, .. } | Node::Group { node, .. } | Node::Atomic(node) => {
                        ctx.charge_work(1, Utf16::default())?;
                        tasks.push(Task::Visit(node))
                    }
                    _ => {}
                }
            }
            Task::Finish(node) => {
                ctx.charge_work(1, Utf16::default())?;
                let value = match node {
                    Node::Empty | Node::Anchor(..) | Node::Look { .. } => Some(0),
                    Node::Literal(..) | Node::Any(..) | Node::Class(..) => Some(1),
                    Node::Backref { width, .. } => *width,
                    Node::Seq(nodes) => {
                        let Some(start) = widths.len().checked_sub(nodes.len()) else {
                            return Ok(None);
                        };
                        ctx.charge_work(nodes.len(), Utf16::default())?;
                        let values: Vec<_> = widths.drain(start..).collect();
                        values
                            .into_iter()
                            .try_fold(0usize, |sum, width| sum.checked_add(width?))
                    }
                    Node::Alt(nodes) => {
                        let Some(start) = widths.len().checked_sub(nodes.len()) else {
                            return Ok(None);
                        };
                        ctx.charge_work(nodes.len(), Utf16::default())?;
                        let values: Vec<_> = widths.drain(start..).collect();
                        let Some(Some(first)) = values.first() else {
                            return Ok(None);
                        };
                        let first = *first;
                        values
                            .iter()
                            .all(|width| *width == Some(first))
                            .then_some(first)
                    }
                    Node::Repeat { min, max, .. } => {
                        let Some(Some(inner)) = widths.pop() else {
                            return Ok(None);
                        };
                        if Some(*min) == *max {
                            inner.checked_mul(*min as usize)
                        } else {
                            None
                        }
                    }
                    Node::Group { .. } | Node::Atomic(..) => {
                        let Some(width) = widths.pop() else {
                            return Ok(None);
                        };
                        width
                    }
                    Node::Conditional { .. } => {
                        ctx.charge_work(2, Utf16::default())?;
                        let Some(no) = widths.pop() else {
                            return Ok(None);
                        };
                        let Some(yes) = widths.pop() else {
                            return Ok(None);
                        };
                        (yes == no).then_some(yes).flatten()
                    }
                };
                ctx.charge_work(1, Utf16::default())?;
                widths.push(value);
            }
        }
    }
    Ok(widths.pop().flatten())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn re(pattern: &str) -> PythonRegex {
        PythonRegex::compile(&Utf16::from(pattern), PythonReVersion::V3_11).unwrap()
    }
    fn find(pattern: &str, text: &str) -> Option<(usize, usize)> {
        re(pattern).find_from_utf16(&text.encode_utf16().collect::<Vec<_>>(), 0)
    }
    #[test]
    fn basic_and_heap_repeats() {
        assert_eq!(find("ab+c?", "xxabbbc!"), Some((2, 7)));
        assert_eq!(find("a{100000}", &"a".repeat(100_000)), Some((0, 100_000)));
    }
    #[test]
    fn captures_backrefs_and_alternation() {
        assert_eq!(find(r"(?P<x>a+)b(?P=x)", "zaabaa"), Some((1, 6)));
        assert_eq!(find(r"(ab|cd)+", "xxabcd"), Some((2, 6)));
    }
    #[test]
    fn lookarounds_anchors_and_flags() {
        assert_eq!(find(r"(?<=ab)c", "zabc"), Some((3, 4)));
        assert_eq!(find(r"(?P<x>abc)(?<=\1)z", "abcz"), Some((0, 4)));
        assert_eq!(find(r"(?=(a))(?(1)a|b)", "a"), Some((0, 1)));
        assert_eq!(find(r"a(?=b)", "zab"), Some((1, 2)));
        assert_eq!(find(r"(?i)^a$", "A"), Some((0, 1)));
        assert_eq!(find(r"(?i)^k$", "K"), Some((0, 1)));
        assert_eq!(find(r"(?ai)^k$", "K"), None);
        assert_eq!(find(r"(?ai)^[a-z]$", "K"), None);
        assert_eq!(find(r"(?>a*)a", "aaa"), None);
        assert_eq!(find(r"a*+a", "aaa"), None);
        assert_eq!(find(r"(a)?(?(1)b|c)", "c"), Some((0, 1)));
    }
    #[test]
    fn preserves_surrogates_and_codepoint_offsets() {
        let r = PythonRegex::compile(&Utf16::new(vec![0xd800]), PythonReVersion::V3_11).unwrap();
        assert_eq!(r.find_from_utf16(&[b'a' as u16, 0xd800], 0), Some((1, 2)));
        let r = PythonRegex::compile(&Utf16::from("."), PythonReVersion::V3_11).unwrap();
        assert_eq!(r.find_from_utf16(&[0xd83d, 0xde00], 0), Some((0, 1)));

        let explicit_pair =
            PythonRegex::compile_codepoints(&[0xd800, 0xdc00], PythonReVersion::V3_11).unwrap();
        assert_eq!(
            explicit_pair.find_from_codepoints(&[0xd800, 0xdc00], 0),
            Some((0, 2))
        );
        assert_eq!(explicit_pair.find_from_codepoints(&[0x10000], 0), None);
        let astral = PythonRegex::compile_codepoints(&[0x10000], PythonReVersion::V3_11).unwrap();
        assert_eq!(astral.find_from_codepoints(&[0x10000], 0), Some((0, 1)));
        assert_eq!(astral.find_from_codepoints(&[0xd800, 0xdc00], 0), None);
        assert!(PythonRegex::compile_codepoints(&[0x110000], PythonReVersion::V3_11).is_err());
    }
    #[test]
    fn invalid_syntax_and_version_are_explicit() {
        assert_eq!(
            PythonReVersion::from_minor(14).unwrap_err().code(),
            "PYTHON_REGEX_PROFILE_UNAVAILABLE"
        );
        assert!(PythonRegex::compile(&Utf16::from("(?<=a+)b"), PythonReVersion::V3_11).is_err());
        assert!(
            PythonRegex::compile(&Utf16::from("(?P<x>abc)(?<=\\1)z"), PythonReVersion::V3_11)
                .is_ok()
        );
        assert!(
            PythonRegex::compile(&Utf16::from("(?P<x>a+)(?<=\\1)z"), PythonReVersion::V3_11)
                .is_err()
        );
        assert!(PythonRegex::compile(&Utf16::from("[z-a]"), PythonReVersion::V3_11).is_err());
        assert!(PythonRegex::compile(&Utf16::from("[a-\\d]"), PythonReVersion::V3_11).is_err());
        assert!(PythonRegex::compile(&Utf16::from("(?au)a"), PythonReVersion::V3_11).is_err());
        assert!(PythonRegex::compile(&Utf16::from("(?i-i:a)"), PythonReVersion::V3_11).is_err());
        assert!(PythonRegex::compile(&Utf16::from("(?a-u:a)"), PythonReVersion::V3_11).is_err());
        assert!(PythonRegex::compile(&Utf16::from("(?u)a"), PythonReVersion::V3_11).is_ok());
        assert!(PythonRegex::compile(&Utf16::from("(?i-m:a)"), PythonReVersion::V3_11).is_ok());
        assert!(PythonRegex::compile(&Utf16::from("(?P<é>a)"), PythonReVersion::V3_11).is_ok());
        assert!(PythonRegex::compile(&Utf16::from("(?P<1a>a)"), PythonReVersion::V3_11).is_err());
        // In Python `re`, dot and `$` use LF rather than the wider Unicode
        // line-break property.
        assert_eq!(find("a.$", "a\r"), Some((0, 2)));
        assert_eq!(find("a.$", "a\n"), None);
    }
    #[test]
    fn unicode_classes_and_versioned_tables() {
        let arabic = Utf16::new(vec![0x0662]);
        let superscript = Utf16::new(vec![0x00b2]);
        assert_eq!(
            PythonRegex::compile(&Utf16::from(r"\d"), PythonReVersion::V3_11)
                .unwrap()
                .find_from_utf16(arabic.units(), 0),
            Some((0, 1))
        );
        assert_eq!(
            PythonRegex::compile(&Utf16::from(r"\d"), PythonReVersion::V3_11)
                .unwrap()
                .find_from_utf16(superscript.units(), 0),
            None
        );
        let c = Utf16::new(vec![0xd807, 0xdf50]);
        assert_eq!(
            PythonRegex::compile(&Utf16::from(r"\d"), PythonReVersion::V3_11)
                .unwrap()
                .find_from_utf16(c.units(), 0),
            None
        );
        assert_eq!(
            PythonRegex::compile(&Utf16::from(r"\d"), PythonReVersion::V3_12)
                .unwrap()
                .find_from_utf16(c.units(), 0),
            Some((0, 1))
        );
        assert_eq!(
            PythonRegex::compile(&Utf16::from("\\w"), PythonReVersion::V3_13)
                .unwrap()
                .find_from_utf16(&[0x00e9], 0),
            Some((0, 1))
        );
        let named = PythonRegex::compile(
            &Utf16::from(r"\N{latin capital letter a}"),
            PythonReVersion::V3_11,
        )
        .unwrap();
        assert_eq!(named.find_from_utf16(&[65], 0), Some((0, 1)));
        let alias =
            PythonRegex::compile(&Utf16::from(r"\N{null}"), PythonReVersion::V3_11).unwrap();
        assert_eq!(alias.find_from_utf16(&[0], 0), Some((0, 1)));
        assert!(PythonRegex::compile(
            &Utf16::from(r"\N{not a real Unicode name}"),
            PythonReVersion::V3_11
        )
        .is_err());
    }

    fn check_cpython_corpus(data: &str, version: PythonReVersion) {
        for (line_number, row) in data.lines().enumerate() {
            let fields: Vec<_> = row.split('\t').collect();
            assert_eq!(fields.len(), 5, "bad frozen corpus row {}", line_number + 1);
            let decode = |field: &str| -> Vec<u16> {
                if field.is_empty() {
                    return Vec::new();
                }
                field
                    .split(',')
                    .map(|unit| u16::from_str_radix(unit, 16).unwrap())
                    .collect()
            };
            let pattern = Utf16::new(decode(fields[3]));
            let input = decode(fields[4]);
            let compiled = PythonRegex::compile(&pattern, version);
            match fields[0] {
                "E" => assert!(
                    compiled.is_err(),
                    "{}:{} accepted",
                    version.minor(),
                    line_number + 1
                ),
                "N" => assert_eq!(
                    compiled.unwrap().find_from_utf16(&input, 0),
                    None,
                    "{}:{} unexpectedly matched",
                    version.minor(),
                    line_number + 1
                ),
                "M" => {
                    let expected = (fields[1].parse().unwrap(), fields[2].parse().unwrap());
                    assert_eq!(
                        compiled
                            .unwrap_or_else(|error| panic!(
                                "{}:{} rejected expected-valid pattern {:?}: {}",
                                version.minor(),
                                line_number + 1,
                                pattern.units(),
                                error.message()
                            ))
                            .find_from_utf16(&input, 0),
                        Some(expected),
                        "{}:{} span mismatch",
                        version.minor(),
                        line_number + 1
                    );
                }
                other => panic!("unknown corpus status {other}"),
            }
        }
    }

    #[test]
    fn official_cpython_311_regex_corpus() {
        check_cpython_corpus(
            include_str!("../tests/fixtures/cpython-re/outcomes-3.11.tsv"),
            PythonReVersion::V3_11,
        );
    }

    #[test]
    fn official_cpython_312_regex_corpus() {
        check_cpython_corpus(
            include_str!("../tests/fixtures/cpython-re/outcomes-3.12.tsv"),
            PythonReVersion::V3_12,
        );
    }

    #[test]
    fn official_cpython_313_regex_corpus() {
        check_cpython_corpus(
            include_str!("../tests/fixtures/cpython-re/outcomes-3.13.tsv"),
            PythonReVersion::V3_13,
        );
    }

    #[test]
    fn nested_group_limit_matches_cpython_recursion_admission_without_stack_recursion() {
        let nested = |count: usize| {
            let mut pattern = "(".repeat(count);
            pattern.push('a');
            pattern.push_str(&")".repeat(count));
            Utf16::from(pattern)
        };
        assert!(PythonRegex::compile(&nested(495), PythonReVersion::V3_11).is_ok());
        assert!(PythonRegex::compile(&nested(496), PythonReVersion::V3_11).is_err());
        let look_depth =
            |count: usize| Utf16::from(format!("{}a{}", "(?=".repeat(count), ")".repeat(count)));
        let look = PythonRegex::compile(&look_depth(495), PythonReVersion::V3_11).unwrap();
        assert_eq!(look.find_from_utf16(&[b'a' as u16], 0), Some((0, 0)));
        assert!(PythonRegex::compile(&look_depth(496), PythonReVersion::V3_11).is_err());
    }

    #[test]
    fn regex_meter_denials_propagate_before_compile_and_state_clone_allocations() {
        use crate::error::EngineError;

        let mut calls = 0usize;
        let mut deny_second = |_: usize| {
            calls += 1;
            if calls == 2 {
                Err(EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "test meter denial",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut deny_second);
        let error = PythonRegex::compile_codepoints_with_context(
            &[b'a' as u32],
            PythonReVersion::V3_11,
            &mut ctx,
        )
        .expect_err("compiler precharge is denied");
        assert_eq!(error.code, "METER_STOP");
        assert_eq!(calls, 2, "denial must precede parser/compiler allocation");

        let regex = PythonRegex::compile(&Utf16::from("a|b"), PythonReVersion::V3_11).unwrap();
        let mut calls = 0usize;
        let mut deny_state_clone = |_: usize| {
            calls += 1;
            if calls == 5 {
                Err(EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "test meter denial",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut deny_state_clone);
        let error = regex
            .find_from_codepoints_with_context(&[b'a' as u32], 0, &mut ctx)
            .expect_err("branch state copy is metered");
        assert_eq!(error.code, "METER_STOP");
        assert_eq!(calls, 5, "state-vector clone charge must precede clone");
    }

    #[test]
    fn named_unicode_lookup_charges_each_scanned_record() {
        use crate::error::EngineError;

        let mut calls = 0usize;
        let mut deny_name_scan = |_: usize| {
            calls += 1;
            if calls == 5 {
                Err(EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "test meter denial",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut deny_name_scan);
        let pattern = r"\N{CANCELLED NAME}"
            .chars()
            .map(u32::from)
            .collect::<Vec<_>>();
        let error = PythonRegex::compile_codepoints_with_context(
            &pattern,
            PythonReVersion::V3_11,
            &mut ctx,
        )
        .expect_err("Unicode-name table scan is charged");
        assert_eq!(error.code, "METER_STOP");
        assert_eq!(calls, 5);
    }

    #[test]
    fn repeated_capture_width_walks_are_metered_at_the_work_site() {
        use crate::error::EngineError;

        let depth = 400;
        let mut pattern = String::with_capacity(depth * 2 + 10_000);
        pattern.extend(std::iter::repeat_n('(', depth));
        pattern.extend(std::iter::repeat_n('a', 10_000));
        pattern.extend(std::iter::repeat_n(')', depth));

        let mut spent = 0usize;
        let mut meter = |amount: usize| {
            spent = spent.saturating_add(amount);
            if spent > 1_000_000 {
                Err(EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "fixed-width traversal exceeds test budget",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = PythonRegex::compile_codepoints_with_context(
            &pattern.chars().map(u32::from).collect::<Vec<_>>(),
            PythonReVersion::V3_11,
            &mut ctx,
        )
        .expect_err("nested width traversal must expose its actual work to the meter");
        assert_eq!(error.code, "METER_STOP");
        assert!(spent > 1_000_000);
    }

    #[test]
    fn regex_native_operands_do_not_use_the_source_text_ceiling() {
        let mut pattern = String::with_capacity(4_000_006);
        pattern.push_str("(?x)#");
        pattern.extend(std::iter::repeat_n('x', 4_000_001));
        let compiled = PythonRegex::compile(&Utf16::from(pattern), PythonReVersion::V3_11);
        assert!(compiled.is_ok(), "large copied pattern is not source text");

        let regex = PythonRegex::compile(&Utf16::from(r"\A"), PythonReVersion::V3_11).unwrap();
        let text = vec![b'a' as u16; 4_000_001];
        assert_eq!(regex.find_from_utf16(&text, 0), Some((0, 0)));
    }
}

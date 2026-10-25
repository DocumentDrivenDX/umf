# R2 default companion discovery/compile stage — clarification004

Narrow SOURCE-DESIGN correction to companion001 and Field-archive addendum002
(c7ceb535f08ec6421be580f01a7e20089969d173196df096ad8348f501b93f59).
Read with per-command context addendum003. Predecessors remain immutable.
This closes the stage ambiguity in002's 'required branch-A selector' wording.
No runtime, adoption or source/native support is claimed.

The CLOSED marker-free inventory.2 discovery selector remains EXACT original:
`{version,tableIntents,conversions,retiredSeedSets,retirements,restorations,
archiveSources,tableArchiveSources}`. It has NO defaultChanges key. Do not add
that key, synthesize markerful compiler options, call compile, or make discovery
of a default companion depend on a future default selection/marker.

DISCOVER: from the actual selected restoration plus its complete original archive
materials/history and desired source, emit EVERY actual archived-to-after default
delta as its exact branch-A restored-field-source-change/change-default Candidate,
independently of defaultChanges. Branch B whole-table archived default companions
are likewise source-derived; branch C current retained defaults retain original
source-derived discovery. Real unchanged defaults emit none. Requiredness and
all other admitted source companions remain independently source-derived too.
Only existing restoration selection/source/archive inputs determine the correct
A/B/C baseline; no future compiler selection is invented to complete discovery.

COMPILE: validate exact original options, rederive complete C from marker-free
discovery and actual source/history; require EVERY and ONLY real default delta
to have exactly one matching existing defaultChanges:{table,field} selector under
its unique A/B/C baseline, plus the exact corresponding Candidate five-key marker
in the full ordered reviewedChanges. Bind and consume both selector and marker
ONCE through the genuine joint source certificate. Missing, duplicate, extra,
unchanged-target or wrong-baseline selectors refuse; no data fill follows.
This is what002 means by the required branch-A selector, strictly at COMPILE.

VERIFY/SERIALIZE: same source/history discovery plus complete compiler selector/
claim validation and canonical full plan comparison. Never use a marker or hash
to bypass unsupported after meaning or original native validation. Other selector
members/key sets and old .1/G03/G05 behavior remain unchanged.

Required controls (UNRUN): independently discover changed Field-archive default
with only original closed selector; same for whole archive/current baseline;
reject discovery defaultChanges key; compile missing/extra/duplicate/unchanged/
wrong-target/default marker cases; exact same emitted C under all eventual
marker/selection order perturbations; no fake id/options/source or callback;
complete browser/type/schema/canonical/native/installed/release gates remain OPEN.

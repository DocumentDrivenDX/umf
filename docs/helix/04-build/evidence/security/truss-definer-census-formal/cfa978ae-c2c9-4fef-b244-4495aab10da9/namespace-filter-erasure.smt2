; benchmark generated from python API
(set-info :status unknown)
(declare-fun definer () Bool)
(declare-fun executable () Bool)
(declare-fun namespace_usage () Bool)
(declare-fun other_selected () Bool)
(declare-fun prior_reason () Bool)
(declare-fun unsafe_role () Bool)
(assert
 definer)
(assert
 executable)
(assert
 (not namespace_usage))
(assert
 (not other_selected))
(assert
 (not prior_reason))
(assert
 (not unsafe_role))
(assert
 (let (($x23 (and definer executable namespace_usage)))
(not (or $x23 other_selected prior_reason unsafe_role))))
(check-sat)

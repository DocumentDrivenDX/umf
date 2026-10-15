; benchmark generated from python API
(set-info :status unknown)
(declare-fun partial_count () Int)
(declare-fun any_occurrence_failed () Bool)
(assert
 (>= partial_count 0))
(assert
 any_occurrence_failed)
(assert
 (let ((?x48 (ite any_occurrence_failed 0 partial_count)))
(> ?x48 0)))
(check-sat)

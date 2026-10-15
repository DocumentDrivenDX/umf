; benchmark generated from python API
(set-info :status unknown)
(declare-fun any_occurrence_failed () Bool)
(declare-fun partial_count () Int)
(assert
 any_occurrence_failed)
(assert
 (> partial_count 0))
(check-sat)

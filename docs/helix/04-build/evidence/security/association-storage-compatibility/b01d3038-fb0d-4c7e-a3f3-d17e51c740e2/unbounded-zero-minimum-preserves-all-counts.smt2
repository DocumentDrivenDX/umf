; benchmark generated from python API
(set-info :status unknown)
(declare-fun participation_count () Int)
(assert
 (>= participation_count 0))
(assert
 (not (and (>= participation_count 0))))
(check-sat)

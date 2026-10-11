; benchmark generated from python API
(set-info :status unknown)
(declare-fun physical_maximum () Int)
(declare-fun participation_count () Int)
(assert
 (>= physical_maximum 0))
(assert
 (>= participation_count 0))
(assert
 (> participation_count physical_maximum))
(check-sat)

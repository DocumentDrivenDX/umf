; benchmark generated from python API
(set-info :status unknown)
(declare-fun D_snapshot_order () Int)
(declare-fun E_commit_order () Int)
(assert
 (let (($x51 (<= E_commit_order D_snapshot_order)))
(and (< D_snapshot_order E_commit_order) $x51)))
(check-sat)

; benchmark generated from python API
(set-info :status unknown)
(declare-fun inventory () Int)
(declare-fun stage () Int)
(declare-fun report () Int)
(assert
 (< stage inventory))
(assert
 (< inventory report))
(assert
 (< report stage))
(check-sat)

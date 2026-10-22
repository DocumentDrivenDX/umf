; benchmark generated from python API
(set-info :status unknown)
(declare-fun rule4 () Bool)
(declare-fun rule1 () Bool)
(declare-fun rule0 () Bool)
(declare-fun rule5 () Bool)
(declare-fun rule3 () Bool)
(declare-fun rule2 () Bool)
(assert
 (let (($x15 (or rule4)))
 (let (($x29 (not $x15)))
 (let (($x12 (or rule0 rule1)))
 (let (($x11 (or rule0 rule1 rule2 rule3 rule4 rule5)))
 (and $x11 $x12 $x29))))))
(assert
 (or rule0 rule1))
(assert
 rule2)
(assert
 (not rule4))
(check-sat)

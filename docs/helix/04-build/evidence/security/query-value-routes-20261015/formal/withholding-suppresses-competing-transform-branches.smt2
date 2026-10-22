; benchmark generated from python API
(set-info :status unknown)
(declare-fun rule4 () Bool)
(declare-fun rule5 () Bool)
(declare-fun rule3 () Bool)
(declare-fun rule2 () Bool)
(declare-fun rule1 () Bool)
(declare-fun rule0 () Bool)
(assert
 rule4)
(assert
 (let (($x15 (or rule4)))
(let (($x11 (or rule0 rule1 rule2 rule3 rule4 rule5)))
(let (($x26 (and $x11 $x15)))
(not $x26)))))
(check-sat)

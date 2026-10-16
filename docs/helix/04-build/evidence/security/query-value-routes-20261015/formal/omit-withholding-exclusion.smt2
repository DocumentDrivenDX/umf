; benchmark generated from python API
(set-info :status unknown)
(declare-fun rule2 () Bool)
(declare-fun rule1 () Bool)
(declare-fun rule0 () Bool)
(declare-fun rule5 () Bool)
(declare-fun rule4 () Bool)
(declare-fun rule3 () Bool)
(assert
 (let (($x13 (or rule2)))
 (let (($x28 (not $x13)))
 (let (($x12 (or rule0 rule1)))
 (let (($x11 (or rule0 rule1 rule2 rule3 rule4 rule5)))
 (and $x11 $x12 $x28))))))
(assert
 rule4)
(check-sat)

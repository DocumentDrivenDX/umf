; benchmark generated from python API
(set-info :status unknown)
(declare-fun positive_width () Int)
(declare-fun origin () Int)
(declare-fun input_low () Int)
(declare-fun x () Int)
(assert
 (let ((?x39 (+ origin (* (div (- input_low origin) positive_width) positive_width))))
(let ((?x35 (+ origin (* (div (- x origin) positive_width) positive_width))))
(let (($x31 (<= input_low x)))
(let (($x30 (> positive_width 0)))
(and $x30 $x31 (< ?x35 ?x39)))))))
(check-sat)

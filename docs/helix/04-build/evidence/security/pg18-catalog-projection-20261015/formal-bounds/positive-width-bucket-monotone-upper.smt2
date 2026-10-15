; benchmark generated from python API
(set-info :status unknown)
(declare-fun positive_width () Int)
(declare-fun origin () Int)
(declare-fun input_high () Int)
(declare-fun x () Int)
(assert
 (let ((?x46 (+ origin (* (div (- input_high origin) positive_width) positive_width))))
(let ((?x35 (+ origin (* (div (- x origin) positive_width) positive_width))))
(let (($x42 (<= x input_high)))
(let (($x30 (> positive_width 0)))
(and $x30 $x42 (> ?x35 ?x46)))))))
(check-sat)

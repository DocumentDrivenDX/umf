; benchmark generated from python API
(set-info :status unknown)
(declare-fun original_source_exact () Bool)
(declare-fun registered_interpretation () Bool)
(declare-fun authenticated_operation () Bool)
(assert
 original_source_exact)
(assert
 (let (($x62 (not registered_interpretation)))
(let (($x61 (not authenticated_operation)))
(and $x61 $x62))))
(check-sat)

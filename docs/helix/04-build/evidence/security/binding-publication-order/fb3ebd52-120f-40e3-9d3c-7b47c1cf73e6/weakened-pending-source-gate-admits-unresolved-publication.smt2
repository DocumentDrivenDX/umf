; benchmark generated from python API
(set-info :status unknown)
(declare-sort Definition 0)
(declare-fun publish () Int)
(declare-fun recheck () Int)
(declare-fun promote () Int)
(declare-fun report () Int)
(declare-fun inventory () Int)
(declare-fun stage () Int)
(declare-fun registered_interpretation () Bool)
(declare-fun authenticated_operation () Bool)
(declare-fun original_source_exact () Bool)
(declare-fun complete_final_closure () Bool)
(declare-fun physical_value_after (Definition) Int)
(declare-fun physical_value_before (Definition) Int)
(declare-fun inventory_before (Definition) Bool)
(declare-fun inventory_after (Definition) Bool)
(declare-fun final_generation () Int)
(declare-fun current_generation () Int)
(declare-fun report_generation () Int)
(declare-fun pending_binding_source_remains () Bool)
(assert
 (let (($x14 (< inventory report)))
 (let (($x13 (< stage inventory)))
 (let (($x12 (>= stage 0)))
 (and $x12 $x13 $x14 (< report promote) (< promote recheck) (< recheck publish))))))
(assert
 registered_interpretation)
(assert
 authenticated_operation)
(assert
 original_source_exact)
(assert
 complete_final_closure)
(assert
 (forall ((definition Definition) )(let (($x42 (= (physical_value_before definition) (physical_value_after definition))))
 (let (($x43 (inventory_before definition)))
 (let (($x46 (= $x43 (inventory_after definition))))
 (and $x46 (=> $x43 $x42))))))
 )
(assert
 (let (($x26 (>= report_generation 0)))
 (and $x26 (> final_generation report_generation) (>= current_generation final_generation))))
(assert
 (= current_generation final_generation))
(assert
 pending_binding_source_remains)
(check-sat)

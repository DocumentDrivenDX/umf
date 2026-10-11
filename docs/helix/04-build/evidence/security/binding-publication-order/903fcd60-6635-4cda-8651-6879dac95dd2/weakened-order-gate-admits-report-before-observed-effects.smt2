; benchmark generated from python API
(set-info :status unknown)
(declare-sort Definition 0)
(declare-fun registered_interpretation () Bool)
(declare-fun authenticated_operation () Bool)
(declare-fun original_source_exact () Bool)
(declare-fun complete_final_closure () Bool)
(declare-fun physical_value_after (Definition) Int)
(declare-fun physical_value_before (Definition) Int)
(declare-fun inventory_before (Definition) Bool)
(declare-fun inventory_after (Definition) Bool)
(declare-fun post_head_checked_generation () Int)
(declare-fun commit_generation () Int)
(declare-fun head_generation () Int)
(declare-fun final_generation () Int)
(declare-fun current_generation () Int)
(declare-fun report_generation () Int)
(declare-fun pending_binding_source_remains () Bool)
(declare-fun original_head_transition_and_full_post_head_closure () Bool)
(declare-fun stage () Int)
(declare-fun report () Int)
(assert
 registered_interpretation)
(assert
 authenticated_operation)
(assert
 original_source_exact)
(assert
 complete_final_closure)
(assert
 (forall ((definition Definition) )(let (($x55 (= (physical_value_before definition) (physical_value_after definition))))
 (let (($x56 (inventory_before definition)))
 (let (($x59 (= $x56 (inventory_after definition))))
 (and $x59 (=> $x56 $x55))))))
 )
(assert
 (let (($x33 (>= report_generation 0)))
 (and $x33 (> final_generation report_generation) (>= current_generation final_generation) (= head_generation (+ final_generation 1)) (>= post_head_checked_generation head_generation) (>= commit_generation post_head_checked_generation))))
(assert
 (= current_generation final_generation))
(assert
 (not pending_binding_source_remains))
(assert
 original_head_transition_and_full_post_head_closure)
(assert
 (= post_head_checked_generation head_generation))
(assert
 (= commit_generation post_head_checked_generation))
(assert
 (let (($x69 (< report stage)))
(let (($x78 (>= report 0)))
(let (($x14 (>= stage 0)))
(and $x14 $x78 $x69)))))
(check-sat)

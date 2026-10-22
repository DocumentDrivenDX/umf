; benchmark generated from python API
(set-info :status unknown)
(declare-fun target_is_project () Bool)
(declare-fun target_is_staff () Bool)
(declare-fun source_is_project () Bool)
(declare-fun source_is_staff () Bool)
(declare-fun same_witness_active () Bool)
(declare-fun target_matches_requested_key () Bool)
(declare-fun source_matches_requested_key () Bool)
(assert
 (and (and (distinct source_is_staff target_is_staff) true) (and (distinct source_is_project target_is_project) true) (and (distinct source_is_staff source_is_project) true) (and (distinct target_is_staff target_is_project) true)))
(assert
 (let (($x24 (and source_is_staff source_matches_requested_key target_is_project target_matches_requested_key same_witness_active)))
(let (($x76 (not $x24)))
(let (($x21 (ite source_is_project source_matches_requested_key target_matches_requested_key)))
(let (($x20 (ite source_is_staff source_matches_requested_key target_matches_requested_key)))
(let (($x22 (and $x20 $x21 same_witness_active)))
(and $x22 $x76)))))))
(check-sat)

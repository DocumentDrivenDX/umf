; benchmark generated from python API
(set-info :status unknown)
(declare-datatypes ((FaithfulTypeLink 0)) (((link (role Int) (module Int) (element Int) (opaque Int)))))
(declare-fun authored_reference () FaithfulTypeLink)
(declare-fun source_links () (Seq FaithfulTypeLink))
(declare-fun authored_target_links () (Seq FaithfulTypeLink))
(declare-fun receipt_recomputed () Bool)
(declare-fun both_kind_receipts_verified () Bool)
(declare-fun current_links () (Seq FaithfulTypeLink))
(declare-fun receipt_target_context () Int)
(declare-fun current_context () Int)
(declare-fun authored_field_element () Int)
(declare-fun requested_element () Int)
(declare-fun authored_field_module () Int)
(declare-fun requested_module () Int)
(declare-fun observed_context () Int)
(declare-fun input_receipt () Int)
(declare-fun observed_receipt () Int)
(declare-fun observed_link () FaithfulTypeLink)
(declare-fun authored_path () Int)
(declare-fun observed_path () Int)
(declare-fun authored_record_path () Int)
(declare-fun observed_record_path () Int)
(declare-fun observed_target_element () Int)
(declare-fun observed_target_module () Int)
(declare-fun observed_index () Int)
(declare-fun closed_result () Bool)
(declare-fun receipt_consistency () Bool)
(declare-fun issuer_authority () Bool)
(declare-fun native_enforcement () Bool)
(declare-fun generic_type_assertion () Bool)
(declare-fun observed_record_kind () Int)
(assert
 (= (role authored_reference) 1))
(assert
 (= authored_target_links (seq.++ source_links (seq.unit authored_reference))))
(assert
 receipt_recomputed)
(assert
 both_kind_receipts_verified)
(assert
 (let (($x41 (= current_links authored_target_links)))
 (let (($x40 (= current_context receipt_target_context)))
 (and $x40 $x41))))
(assert
 (let (($x44 (= requested_element authored_field_element)))
 (let (($x43 (= requested_module authored_field_module)))
 (and $x43 $x44))))
(assert
 (= observed_context current_context))
(assert
 (= observed_receipt input_receipt))
(assert
 (= observed_link authored_reference))
(assert
 (= observed_path authored_path))
(assert
 (= observed_record_path authored_record_path))
(assert
 (let (($x54 (= observed_target_element (element authored_reference))))
 (let ((?x51 (module authored_reference)))
 (let (($x52 (= observed_target_module ?x51)))
 (and $x52 $x54)))))
(assert
 (let ((?x56 (seq.len source_links)))
 (= observed_index ?x56)))
(assert
 closed_result)
(assert
 receipt_consistency)
(assert
 (not issuer_authority))
(assert
 (not native_enforcement))
(assert
 (not generic_type_assertion))
(assert
 (= observed_record_kind 1))
(assert
 (let ((?x56 (seq.len source_links)))
(= ?x56 0)))
(check-sat)

; benchmark generated from python API
(set-info :status unknown)
(declare-sort FaithfulOrderedUnknownPathList 0)
(declare-sort FaithfulOrderedQualifiedMemberList 0)
(declare-fun owner_state () Int)
(declare-fun explicit_record () Bool)
(declare-fun members_present () Bool)
(declare-fun opaque_member_qualifier () Bool)
(declare-fun empty_paths () FaithfulOrderedUnknownPathList)
(declare-fun original_unknown_paths () FaithfulOrderedUnknownPathList)
(declare-fun original_context () Int)
(declare-fun owner_context () Int)
(declare-fun observed_members () FaithfulOrderedQualifiedMemberList)
(declare-fun original_members () FaithfulOrderedQualifiedMemberList)
(declare-fun closed_owner_result () Bool)
(declare-fun observed_unknown_paths () FaithfulOrderedUnknownPathList)
(declare-fun owner_source_carrier () Int)
(declare-fun original_source_carrier () Int)
(assert
 (>= owner_state 0))
(assert
 (<= owner_state 3))
(assert
 (=> members_present explicit_record))
(assert
 (=> opaque_member_qualifier members_present))
(assert
 (= opaque_member_qualifier (and (distinct original_unknown_paths empty_paths) true)))
(assert
 (let ((?x17 (ite opaque_member_qualifier 1 0)))
 (let (($x14 (not members_present)))
 (let (($x13 (not explicit_record)))
 (= owner_state (ite $x13 3 (ite $x14 2 ?x17)))))))
(assert
 (= owner_context original_context))
(assert
 (let (($x38 (= original_members observed_members)))
 (=> members_present $x38)))
(assert
 closed_owner_result)
(assert
 (= original_unknown_paths observed_unknown_paths))
(assert
 (and (distinct original_source_carrier owner_source_carrier) true))
(check-sat)

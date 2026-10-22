; benchmark generated from python API
(set-info :status unknown)
(declare-fun direct_0 () String)
(declare-fun direct_1 () String)
(declare-fun direct_2 () String)
(declare-fun direct_3 () String)
(declare-fun direct_4 () String)
(declare-fun direct_5 () String)
(declare-fun direct_6 () String)
(declare-fun direct_7 () String)
(declare-fun direct_8 () String)
(declare-fun nested_0 () String)
(declare-fun nested_1 () String)
(declare-fun nested_2 () String)
(declare-fun nested_3 () String)
(declare-fun nested_4 () String)
(declare-fun nested_5 () String)
(declare-fun nested_6 () String)
(declare-fun nested_7 () String)
(declare-fun nested_8 () String)
(declare-fun direct_original_actor () String)
(declare-fun nested_original_actor () String)
(declare-fun decide_with_trusted_original_actor (String String String String String String String String String String) Bool)
(assert
 (= direct_0 "capture_ordinary"))
(assert
 (= direct_1 "capture_writer"))
(assert
 (= direct_2 "none"))
(assert
 (= direct_3 "postgres"))
(assert
 (= direct_4 "2726"))
(assert
 (= direct_5 "731"))
(assert
 (= direct_6 "16385"))
(assert
 (= direct_7 "16387"))
(assert
 (= direct_8 "16388"))
(assert
 (= nested_0 "capture_ordinary"))
(assert
 (= nested_1 "capture_writer"))
(assert
 (= nested_2 "none"))
(assert
 (= nested_3 "postgres"))
(assert
 (= nested_4 "2726"))
(assert
 (= nested_5 "731"))
(assert
 (= nested_6 "16385"))
(assert
 (= nested_7 "16387"))
(assert
 (= nested_8 "16388"))
(assert
 (= direct_original_actor "capture_ordinary"))
(assert
 (= nested_original_actor "capture_wrapper"))
(assert
 (decide_with_trusted_original_actor direct_0 direct_1 direct_2 direct_3 direct_4 direct_5 direct_6 direct_7 direct_8 direct_original_actor))
(assert
 (let (($x74 (decide_with_trusted_original_actor nested_0 nested_1 nested_2 nested_3 nested_4 nested_5 nested_6 nested_7 nested_8 nested_original_actor)))
(not $x74)))
(check-sat)

# UMF 0.10.11 local PyPI admission evidence

This evidence binds the 0.10.11 release cohort to merged source commit `09bbf7c447d5749fcf07010ea736d133f96264ff` and tree `817fff25ba17e69e483f5b106157f71eac61ec02`. Core wheels and sdist are pinned to the staged release inventory. Fresh offline CPython 3.11 pair installations on macOS arm64 and Linux x86_64 used the exact Core and Codegen wheels and generated the same result digest. The native source join records the same merged Git tree and exact common Core sdist bytes.

The admission validates these local artifacts and Python pair receipts. Codegen publication also requires a live PyPI hash match for every admitted Core archive before its own collision check.

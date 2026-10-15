# Gate environment correction

The first full gate was launched without UMF_Z3_PYTHON. Its S12 runner therefore
used the default Python, which lacked z3, removed its retained formal output as
designed and failed the fresh replay. The parent noticed the missing output and
independently replayed the unchanged20 models using the verified Z3 environment.
This exposed a separate hardcoded interpreter string in prove.py; that receipt
metadata now records sys.executable and Python version truthfully.

The first gate is retained as a failed run. The next full gate must explicitly
select /private/tmp/umf-write-comparison-proof-env-20261013/bin/python using
UMF_Z3_PYTHON. No failed required case is waived or supplied an old receipt.

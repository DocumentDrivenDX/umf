import subprocess,json,pathlib,os
assert not list(pathlib.Path("/newsource").iterdir())
pathlib.Path("/tmp/git-safe.conf").write_text("[safe]\n\tdirectory = /oldsource\n\tdirectory = /oldsource/.git\n\tdirectory = /newsource\n")
os.environ["GIT_CONFIG_GLOBAL"]="/tmp/git-safe.conf"
p='855f6c48649496fc60b3303798790d0ddb55d38f'
def run(a):
 r=subprocess.run(['git','-c','safe.directory=*',*a],check=False,text=True,capture_output=True,timeout=90);print(r.stdout,end='');print(r.stderr,end='');r.check_returncode();return r.stdout.strip()
run(['clone','--no-hardlinks','/oldsource','/newsource'])
run(['-C','/newsource','fetch','/input/producer.bundle',p])
run(['-C','/newsource','checkout','--detach',p])
assert run(['-C','/newsource','rev-parse','HEAD'])==p
assert run(['-C','/newsource','rev-parse','HEAD^{tree}'])=='53f2bfffbc0c5780e79d76d8fd3d202239d088b2'
assert run(['-C','/newsource','status','--porcelain','--untracked-files=all'])==''
print(json.dumps({'status':'SOURCE_VOLUME_READY','commit':p,'tree':'53f2bfffbc0c5780e79d76d8fd3d202239d088b2','productExecuted':False}))

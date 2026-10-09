# Public PyPI publication

UMF Python distribution: `umf-core`; import namespace: `umf`. Release 0.8.1
retains core document versions through 0.8.0. TableSpec release 0.0.7 currently
uses a pinned Git dependency on UMF, so its existing GitHub release and Pages
index remain the install route pending public PyPI migration.

Configure a PyPI pending publisher for `umf-core` if the project does not yet
exist, or an ordinary publisher if owned already. Exact GitHub identity:
owner `DocumentDrivenDX`, repository `umf`, workflow `pypi.yml`, environment
`pypi`. Then run **Publish UMF Python to PyPI** at the 0.8.1 release commit.
The workflow tests, builds, checks and uploads wheel and source distribution
using OIDC; no stored PyPI token is required.

After `umf-core==0.8.1` is publicly installable, replace TableSpec's direct Git
requirement with `umf-core>=0.8.1,<0.9`, update its lockfile, verify a clean
public-index install and cut a new TableSpec patch. Configure an ordinary
trusted publisher for the existing `tablespec` PyPI project using its owner
account, repository `DocumentDrivenDX/tablespec`, a dedicated `pypi.yml`
workflow and `pypi` environment. PyPI account access/ownership has not been
verified by this session. Do not claim public uploads until verified.

Sources: [PyPI publisher setup](https://docs.pypi.org/trusted-publishers/adding-a-publisher/),
[pending publishers](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/),
[OIDC upload](https://docs.pypi.org/trusted-publishers/using-a-publisher/).

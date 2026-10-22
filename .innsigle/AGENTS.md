# Agent instructions: automated site signing

All first-party site HTML is model-primary content. Use the existing registered
build-role signer for every page in `.innsigle/generated-pages.json`. No human
signature, interactive 1Password session or manual page re-sealing is required.
This owner-directed policy supersedes earlier human/curated signing instructions.

## Key custody

The build private key is supplied only through `INNSIGLE_BUILD_KEY` in the
publication environment (the existing GitHub Actions repository secret).
Never print it, commit it, store it in evidence or copy it into the site.
Do not read a human key or introduce a 1Password reference/fallback. Do not
rotate keys or run `innsigle init` unless explicitly requested.

`.innsigle/config.json` names only the build signer. Public legacy keys and
endorsements stay available to verify older publications; they are not a
requirement for publishing new content. Do not rewrite Innsigle cryptography.

## Build and publish

Use the pinned Innsigle CLI from `.github/workflows/microsite.yml`.
After generating the exact final HTML:

```bash
bun scripts/generated-page-seals.ts --inventory
bun test tests/generated-page-seals.test.ts
# Publication environment supplies INNSIGLE_BUILD_KEY:
bun scripts/generated-page-seals.ts --seal
bun scripts/generated-page-seals.ts --check
node .tools/innsigle/src/cli.mjs verify --all
```

The sealing wrapper explicitly selects `--role build`, uses the model-primary
colophon, signs every inventoried page, and copies public state to the site
before verification. Missing environment credentials must fail without an
interactive fallback. Inventory additions require corresponding policy updates;
no configured page may escape signature verification.

## Public paths

- issuer_id: `documentdrivendx-umf`
- build key_id: `ed25519:c63e7352e15127ee63b9ae2f071602bb`
- key_url: `https://documentdrivendx.github.io/umf/.well-known/innsigle/keys.json`

Always copy `.innsigle/public/` to the site root's
`.well-known/innsigle/`. The wrapper runs Innsigle `publish` for this step.
The local metadata and public state are safe to commit; private signing material
is not. Colophons must not invent human review or human-input percentages.

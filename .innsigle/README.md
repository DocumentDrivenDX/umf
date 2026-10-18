# Innsigle project state

The site uses automated build-key signatures for all first-party HTML. All
current content is model-primary; no human signing key or 1Password unlock is
needed for publication.

- `config.json`: build signer identity and public publication paths.
- `generated-pages.json`: complete root/Actions/Reference HTML inventory.
- `generated-colo.json` / `colo.json`: model-primary provenance.
- `public/`: public keys, endorsements and signed claims, copied to the site's
  `.well-known/innsigle/` by the publishing wrapper.

`INNSIGLE_BUILD_KEY` is supplied by the existing GitHub Actions repository secret.
Private material must never be committed, printed or included in artifacts.
Historical human public keys/endorsements remain to verify older publications;
current publishing has no human-key fallback.

See [AGENTS.md](AGENTS.md) and the deployment workflow for the exact checks.

# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for architecture, the develop/test/release workflow, and the
Shopgate-specific gotchas. Those instructions apply to Claude too.

Quick reminders:
- Run the KB `extension-reviewer` skill before every upload / MR.
- Tests live in `../../matomo-local/`, not in the shipped extension.
- `@shopgate-project` extensions auto-release — `sgconnect extension upload` returning
  "RELEASED" is expected, not an error.

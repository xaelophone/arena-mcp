# Docs Maintenance Checklist

Use this checklist whenever MCP surface or behavior changes.

## Required Updates for MCP Surface Changes

When adding/removing/renaming any resource, tool, or prompt:

1. Update source registration (`src/mcp/resources.ts`, `src/mcp/tools-read.ts`, `src/mcp/tools-write.ts`, `src/mcp/prompts.ts`).
2. Update [API reference](./api-reference.md) sections and examples.
3. Update [README](../README.md) only if install/setup flow changes.
4. Update any affected client docs in `docs/clients/`.

## Validation Commands

Run before commit:

```bash
npm run docs:check
npm run lint
npm run typecheck
npm test
```

`npm run docs:check` enforces:

- `docs/api-reference.md` resources/tools/prompts match source registrations.
- Every read/write tool in API reference has an `Example` subsection.
- Local markdown links in `README.md` and `docs/README.md` resolve.

## Authoring Rules

- Keep root `README.md` focused on onboarding and navigation.
- Put deep implementation and protocol details in `docs/`.
- Avoid hard-coded counts in docs when possible.
- Prefer linking to canonical sections instead of duplicating long blocks.

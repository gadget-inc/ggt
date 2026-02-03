---
globs: spec/**
---

# Test Infrastructure

- Tests in `spec/` mirror `src/` structure
- `spec/__support__/` has test utilities: `testCtx`, mocked HTTP via nock, file helpers
- `spec/__fixtures__/` has sample Gadget app structure
- Uses vitest with setup in `spec/vitest.setup.ts`

---
paths:
  - "src/__generated__/**"
  - "src/services/app/edit/operation.ts"
  - "spec/services/app/edit/**"
---

# GraphQL

## Schema

- `src/__generated__/app.graphql` — app API schema
- `src/__generated__/edit.graphql` — edit API schema

## Operations

Operations are defined in `src/services/app/edit/operation.ts` using ``sprint(/* GraphQL */ `...`)``. The `/* GraphQL */` comment enables editor syntax highlighting. `sprint` is just a tagged template that applies dedent + chalk.

```typescript
export const REMOTE_FILES_VERSION_QUERY = sprint(/* GraphQL */ `
  query RemoteFilesVersion {
    remoteFilesVersion
  }
`) as GraphQLQuery<RemoteFilesVersionQuery, RemoteFilesVersionQueryVariables>;
```

## Branded string types

Operations are typed using branded string types from `operation.ts`:

- `GraphQLQuery<Data, Variables>` — query string branded with response/variable types
- `GraphQLMutation<Data, Variables>` — mutation string
- `GraphQLSubscription<Data, Variables>` — subscription string

At runtime these are plain strings. The type branding allows the GraphQL client to infer `Data` and `Variables` from the operation.

## Codegen

Config: `graphql-codegen.yml`. Scans `src/**/*.ts` (excluding `src/__generated__/`) for operations, generates types to `src/__generated__/graphql.ts`.

```bash
pnpm run generate:graphql
```

## Scalar mappings

- `ID` — `bigint`
- `JSON` — `{ [key: string]: any }`

**Key files:** `src/services/app/edit/operation.ts`, `graphql-codegen.yml`, `src/__generated__/graphql.ts`

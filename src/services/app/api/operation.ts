import type {
  GadgetMetaGlobalActionsQuery,
  GadgetMetaGlobalActionsQueryVariables,
  GadgetMetaModelsQuery,
  GadgetMetaModelsQueryVariables,
} from "../../../__generated__/graphql.ts";
import { sprint } from "../../output/sprint.ts";
import type { GraphQLQuery } from "../edit/operation.ts";

export const GADGET_META_MODELS_QUERY = sprint(/* GraphQL */ `
  query GadgetMetaModels {
    gadgetMeta {
      models {
        apiIdentifier
        namespace
      }
    }
  }
`) as GraphQLQuery<GadgetMetaModelsQuery, GadgetMetaModelsQueryVariables>;

export const GADGET_GLOBAL_ACTIONS_QUERY = sprint(/* GraphQL */ `
  query GadgetMetaGlobalActions {
    gadgetMeta {
      globalActions {
        apiIdentifier
        namespace
      }
    }
  }
`) as GraphQLQuery<GadgetMetaGlobalActionsQuery, GadgetMetaGlobalActionsQueryVariables>;

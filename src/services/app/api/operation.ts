import type {
  GadgetMetaGlobalActionsQuery,
  GadgetMetaGlobalActionsQueryVariables,
  GadgetMetaModelsQuery,
  GadgetMetaModelsQueryVariables,
} from "../../../__generated__/graphql.js";
import type { GraphQLQuery } from "../edit/operation.js";

import { sprint } from "../../output/sprint.js";

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

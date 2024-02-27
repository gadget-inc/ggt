import type { GadgetMetaModelsQuery, GadgetMetaModelsQueryVariables } from "../../../__generated__/graphql.js";
import { sprint } from "../../output/print.js";
import type { GraphQLQuery } from "../edit/operation.js";

export const GADGET_META_MODELS_QUERY = sprint(/* GraphQL */ `
  query GadgetMetaModels {
    gadgetMeta {
      models {
        apiIdentifier
      }
    }
  }
`) as GraphQLQuery<GadgetMetaModelsQuery, GadgetMetaModelsQueryVariables>;

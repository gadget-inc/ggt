import {
  GadgetConnection,
  GadgetRecord,
  GadgetRecordImplementation,
  GadgetRecordList,
  GadgetNonUniqueDataError,
  actionRunner,
  findManyRunner,
  findOneRunner,
  findOneByFieldRunner,
  DefaultSelection,
  LimitToKnownKeys,
  Selectable
} from "@gadgetinc/api-client-core";

import {
  Query,
  ExplicitNestingRequired,
  Select,
  DeepFilterNever,
  IDsList,
      Session,
      AvailableSessionSelection,
  
} from "../types.js";

import { disambiguateActionParams } from "../support.js";

export const DefaultSessionSelection = {
  "__typename": true,
  "createdAt": true,
  "id": true,
  "state": true,
  "updatedAt": true
} as const;

/**
* Produce a type that holds only the selected fields (and nested fields) of "session". The present fields in the result type of this are dynamic based on the options to each call that uses it.
* The selected fields are sometimes given by the `Options` at `Options["select"]`, and if a selection isn't made in the options, we use the default selection from above.
*/
export type SelectedSessionOrDefault<Options extends Selectable<AvailableSessionSelection>> = DeepFilterNever<
  Select<
    Session,
    DefaultSelection<
      AvailableSessionSelection,
      Options,
      typeof DefaultSessionSelection
    >
  >>;

/** Options that can be passed to the `SessionManager#findOne` method */
export interface GetCurrentSessionOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableSessionSelection;
};


const apiIdentifier = "session";
const pluralApiIdentifier = "sessions";





/** All the actions available at the collection level and record level for "session" */
export class CurrentSessionManager {
  constructor(readonly connection: GadgetConnection) {}

  
    /**
 * Retrieves the current session. Returns a `Promise` that resolves to the record if found and rejects the promise if the record isn't found.
 **/
get: {
  <Options extends GetCurrentSessionOptions>(options?: LimitToKnownKeys<Options, GetCurrentSessionOptions>):
    Promise<
      GadgetRecord<
        SelectedSessionOrDefault<Options>
      >
    >;
  type: "get";
  operationName: "currentSession";
  modelApiIdentifier: "session";
  defaultSelection: typeof DefaultSessionSelection;
  selectionType: AvailableSessionSelection;
  optionsType: GetCurrentSessionOptions;
  schemaType: Query["session"];
} = Object.assign(
  async <Options extends GetCurrentSessionOptions>(options?: LimitToKnownKeys<Options, GetCurrentSessionOptions>) => {
    return await findOneRunner<SelectedSessionOrDefault<Options>>(
      this,
      "currentSession",
      undefined,
      DefaultSessionSelection,
      "session",
      options
    );
  },
  {
    type: "get",
    operationName: "currentSession",
    modelApiIdentifier: "session",
    defaultSelection: DefaultSessionSelection,
  } as any
)

  
}

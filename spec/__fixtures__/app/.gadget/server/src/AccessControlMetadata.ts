export type GadgetAccessControl = Record<string, RoleMetadataObject>;

export interface RoleMetadataObject {
  key: string;
  grants: Record<string, GrantMetadataObject>;
}

export interface GrantMetadataObject {
  filter?: string | null; // Model Filter source file path
  key: string;
}

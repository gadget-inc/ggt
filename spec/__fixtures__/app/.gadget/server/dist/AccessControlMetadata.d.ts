export type GadgetPermissions = Record<string, RoleMetadataObject>;
export interface RoleMetadataObject {
    key: string;
    grants: Record<string, GrantMetadataObject>;
}
export interface GrantMetadataObject {
    filter?: string | null;
    key: string;
}

export const AppTenancyKey = Symbol.for("gadget/appTenancy");

export type AppTenant = Partial<{
  shopify: Pick<ShopifyTenant, "shopId">;
}>;

export type AppTenancy = Partial<{
  shopify: ShopifyTenant;
}>;

type ShopifyTenant = {
  shopId: bigint;
  domain: string;
  accessToken: string;
  apiVersion: string;
};

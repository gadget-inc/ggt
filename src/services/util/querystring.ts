import qs from "fast-querystring";

export const serializeObjectToHTTPQuery = (obj: Record<never, never>): string => {
  const data = qs.stringify(obj);
  return data ? `?${data}` : "";
};

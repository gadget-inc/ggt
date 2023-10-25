export const defaults = <TObject extends object, TSource extends object>(
  object: TObject,
  source: TSource,
): NonNullable<TSource & TObject> => {
  return { ...source, ...object };
};

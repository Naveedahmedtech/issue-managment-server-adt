export function normalizeKeys(obj: Record<string, any>) {
    return Object.keys(obj).reduce((acc, key) => {
      acc[key.trim()] = obj[key];
      return acc;
    }, {});
  }

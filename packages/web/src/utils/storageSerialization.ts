function createDateReviver(dateFields: readonly string[]) {
  const fields = new Set(dateFields);

  return function dateReviver(key: string, value: unknown) {
    if (fields.has(key)) {
      return value ? new Date(value as string) : value;
    }
    return value;
  };
}

export function parseJsonWithDateFields<T>(json: string, dateFields: readonly string[]): T {
  return JSON.parse(json, createDateReviver(dateFields)) as T;
}

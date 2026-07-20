type SafeParseSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: unknown };
};

export interface ValidateStoredArrayOptions<T> {
  key: string;
  value: string | null | undefined;
  schema: SafeParseSchema<T>;
  normalize?: (value: unknown) => unknown;
  logLimit?: number;
}

/**
 * Validates independently stored JSON records so one corrupt entry cannot
 * prevent healthy siblings from loading.
 */
export function validateStoredArray<T>({
  key,
  value,
  schema,
  normalize = (record) => record,
  logLimit = 3,
}: ValidateStoredArrayOptions<T>): T[] {
  if (!value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    console.warn(`Failed to parse ${key} from storage`, error);
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn(`Ignoring ${key} from storage because it is not an array`);
    return [];
  }

  const records: T[] = [];
  let skipped = 0;
  let logged = 0;
  const boundedLogLimit = Math.max(0, logLimit);

  for (const [index, record] of parsed.entries()) {
    try {
      const result = schema.safeParse(normalize(record));
      if (result.success) {
        records.push(result.data);
        continue;
      }

      if (logged < boundedLogLimit) {
        console.warn(`Skipping invalid ${key} record at index ${index}`, result.error);
        logged += 1;
      }
    } catch (error) {
      if (logged < boundedLogLimit) {
        console.warn(`Skipping invalid ${key} record at index ${index}`, error);
        logged += 1;
      }
    }
    skipped += 1;
  }

  if (skipped > 0) {
    console.warn(`Skipped ${skipped} invalid records from ${key}`);
  }

  return records;
}

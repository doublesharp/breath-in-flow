type SafeParseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
};

export interface ValidateStoredArrayOptions<T> {
  key: string;
  value: string | null | undefined;
  schema: SafeParseSchema<T>;
  normalize?: (value: unknown) => unknown;
  // Only independently persisted records need IDs. Embedded/ad hoc configs do not.
  getId?: (record: T) => string | undefined;
  logLimit?: number;
}

export function assertUniqueRecordIds(
  records: readonly { id?: string }[],
  collection: string
): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (typeof record.id !== 'string' || !record.id.trim() || seen.has(record.id)) {
      throw new TypeError(`${collection} must have non-empty, unique record IDs.`);
    }
    seen.add(record.id);
  }
}

export function createStoredRecordWarningLogger(key: string, logLimit: number = 3) {
  let skipped = 0;
  let logged = 0;
  const boundedLogLimit = Math.max(0, logLimit);

  return {
    warn(index: number, error?: unknown) {
      if (logged < boundedLogLimit) {
        console.warn(`Skipping invalid ${key} record at index ${index}`, error);
        logged += 1;
      }
      skipped += 1;
    },
    summarize() {
      if (skipped > 0) {
        console.warn(`Skipped ${skipped} invalid records from ${key}`);
      }
    },
  };
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
  getId,
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
  const seenIds = new Set<string>();
  const warnings = createStoredRecordWarningLogger(key, logLimit);

  for (const [index, record] of parsed.entries()) {
    try {
      const result = schema.safeParse(normalize(record));
      if (result.success) {
        if (getId) {
          const id = getId(result.data);
          if (typeof id !== 'string' || !id.trim() || seenIds.has(id)) {
            warnings.warn(index, new TypeError('Missing or duplicate persisted record ID.'));
            continue;
          }
          seenIds.add(id);
        }
        records.push(result.data);
        continue;
      }

      warnings.warn(index, result.error);
    } catch (error) {
      warnings.warn(index, error);
    }
  }

  warnings.summarize();

  return records;
}

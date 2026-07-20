import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseJsonWithDateFields } from '../../src/utils/storageSerialization';
import { validateStoredArray } from '../../src/utils/storedRecordValidation';

type StoredRecord = { id: string; createdAt: Date; enabled: boolean };

const RecordSchema = {
  safeParse(
    value: unknown
  ): { success: true; data: StoredRecord } | { success: false; error: Error } {
    const record = value as Partial<StoredRecord>;
    if (
      typeof record?.id !== 'string' ||
      !(record.createdAt instanceof Date) ||
      Number.isNaN(+record.createdAt)
    ) {
      return { success: false, error: new Error('invalid stored record') };
    }
    return {
      success: true,
      data: { id: record.id, createdAt: record.createdAt, enabled: record.enabled ?? true },
    };
  },
};

describe('validateStoredArray', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns no records when stored JSON is not an array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(
      validateStoredArray({
        key: 'records',
        value: JSON.stringify({ id: 'not-an-array' }),
        schema: RecordSchema,
      })
    ).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('uses identity normalization by default', () => {
    const record = { id: 'current', createdAt: new Date('2026-07-20T00:00:00.000Z') };

    expect(
      validateStoredArray({
        key: 'records',
        value: JSON.stringify([{ id: record.id, createdAt: record.createdAt.toISOString() }]),
        schema: {
          safeParse(value) {
            const parsed = value as { id: string; createdAt: string };
            return {
              success: true as const,
              data: { ...record, id: parsed.id, enabled: true },
            };
          },
        },
      })
    ).toEqual([{ ...record, enabled: true }]);
  });

  it('keeps valid siblings in source order and normalizes legacy defaults before validation', () => {
    const records = validateStoredArray({
      key: 'records',
      value: JSON.stringify([
        { id: 'first', createdAt: '2026-07-20T00:00:00.000Z' },
        { id: 2, createdAt: '2026-07-20T00:00:00.000Z' },
        { id: 'last', createdAt: '2026-07-21T00:00:00.000Z', enabled: false },
      ]),
      schema: RecordSchema,
      normalize: (value) => {
        const record = value as Record<string, unknown>;
        return {
          ...record,
          createdAt: new Date(record.createdAt as string),
        };
      },
    });

    expect(records).toEqual([
      { id: 'first', createdAt: new Date('2026-07-20T00:00:00.000Z'), enabled: true },
      { id: 'last', createdAt: new Date('2026-07-21T00:00:00.000Z'), enabled: false },
    ]);
  });

  it('bounds invalid-record warnings and reports the total skipped count once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const records = validateStoredArray({
      key: 'records',
      value: JSON.stringify([
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 'valid', createdAt: '2026-07-20T00:00:00.000Z' },
      ]),
      schema: RecordSchema,
      normalize: (value) => ({
        ...(value as Record<string, unknown>),
        createdAt: new Date((value as { createdAt: string }).createdAt),
      }),
    });

    expect(records).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls.at(-1)?.[0]).toContain('Skipped 4 invalid records');
  });

  it('skips a record when legacy normalization throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const records = validateStoredArray({
      key: 'records',
      value: JSON.stringify([{ id: 'throws' }]),
      schema: RecordSchema,
      normalize: () => {
        throw new Error('legacy conversion failed');
      },
    });

    expect(records).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Skipping invalid records record at index 0',
      expect.objectContaining({ message: 'legacy conversion failed' })
    );
    expect(warn).toHaveBeenCalledWith('Skipped 1 invalid records from records');
  });
});

describe('parseJsonWithDateFields', () => {
  it('revives only the named date fields, including nested records', () => {
    const parsed = parseJsonWithDateFields<{
      createdAt: Date;
      label: string;
      nested: { completedAt: Date; dateLikeText: string };
    }>(
      JSON.stringify({
        createdAt: '2026-07-20T12:00:00.000Z',
        label: '2026-07-20T12:00:00.000Z',
        nested: {
          completedAt: '2026-07-20T12:30:00.000Z',
          dateLikeText: '2026-07-20T12:30:00.000Z',
        },
      }),
      ['createdAt', 'completedAt']
    );

    expect(parsed.createdAt).toEqual(new Date('2026-07-20T12:00:00.000Z'));
    expect(parsed.label).toBe('2026-07-20T12:00:00.000Z');
    expect(parsed.nested.completedAt).toEqual(new Date('2026-07-20T12:30:00.000Z'));
    expect(parsed.nested.dateLikeText).toBe('2026-07-20T12:30:00.000Z');
  });

  it('preserves null and empty optional date fields', () => {
    const parsed = parseJsonWithDateFields<{ startedAt: null; endedAt: '' }>(
      '{"startedAt":null,"endedAt":""}',
      ['startedAt', 'endedAt']
    );

    expect(parsed).toEqual({ startedAt: null, endedAt: '' });
  });

  it('surfaces malformed JSON instead of returning partial data', () => {
    expect(() => parseJsonWithDateFields('{"startedAt":', ['startedAt'])).toThrow(SyntaxError);
  });
});

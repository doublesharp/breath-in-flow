import { describe, it, expect } from 'vitest';
import {
  BackupEnvelopeShapeSchema,
  BACKUP_FORMAT_VERSION,
  MAX_BACKUP_BYTES,
} from '../src/familyTesting';

function validEnvelope() {
  return {
    formatVersion: 1,
    metadata: { appVersion: '1.0.0', exportedAt: '2026-07-20T12:00:00.000Z' },
    data: {
      preferences: { version: 1, goal: 'RELAX' },
      configs: [],
      sessions: [],
      soundTheme: 'wood',
      lastConfig: null,
      measurements: [],
      assessments: [],
    },
  };
}

describe('BackupEnvelopeShapeSchema', () => {
  it('parses a well-formed backup envelope', () => {
    const envelope = BackupEnvelopeShapeSchema.parse(validEnvelope());
    expect(envelope.formatVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it('allows null preferences for accounts without a saved goal', () => {
    expect(
      BackupEnvelopeShapeSchema.safeParse({
        ...validEnvelope(),
        data: { ...validEnvelope().data, preferences: null },
      }).success
    ).toBe(true);
  });

  it('rejects envelopes with unexpected top-level keys', () => {
    const envelope = BackupEnvelopeShapeSchema.parse(validEnvelope());
    expect(BackupEnvelopeShapeSchema.safeParse({ ...envelope, unexpected: true }).success).toBe(
      false
    );
  });

  it('rejects an unsupported format version', () => {
    expect(
      BackupEnvelopeShapeSchema.safeParse({ ...validEnvelope(), formatVersion: 2 }).success
    ).toBe(false);
  });

  it('rejects an invalid sound theme in the payload', () => {
    expect(
      BackupEnvelopeShapeSchema.safeParse({
        ...validEnvelope(),
        data: { ...validEnvelope().data, soundTheme: 'nope' },
      }).success
    ).toBe(false);
  });
});

describe('backup constants', () => {
  it('caps backups at 25 MiB', () => {
    expect(MAX_BACKUP_BYTES).toBe(25 * 1024 * 1024);
  });

  it('pins the backup format version to 1', () => {
    expect(BACKUP_FORMAT_VERSION).toBe(1);
  });
});

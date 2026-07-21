import { z } from 'zod';
import { SoundThemeSchema, UserPreferencesSchema } from './schemas.js';

export const BACKUP_FORMAT_VERSION = 1 as const;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export const BackupEnvelopeShapeSchema = z
  .object({
    formatVersion: z.literal(BACKUP_FORMAT_VERSION),
    metadata: z
      .object({
        appVersion: z.string().min(1).max(50),
        exportedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    data: z
      .object({
        preferences: UserPreferencesSchema.nullable(),
        configs: z.array(z.unknown()),
        sessions: z.array(z.unknown()),
        soundTheme: SoundThemeSchema,
        lastConfig: z.unknown().nullable(),
        measurements: z.array(z.unknown()),
        assessments: z.array(z.unknown()),
      })
      .strict(),
  })
  .strict();

export type BackupEnvelopeShape = z.infer<typeof BackupEnvelopeShapeSchema>;

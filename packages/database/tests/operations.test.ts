import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/client';
import type * as Operations from '../src/operations';

type OperationsModule = typeof Operations;

let prisma: PrismaClient;
let operations: OperationsModule;
let dbPath: string;
let originalDatabaseUrl: string | undefined;

async function createTestSchema(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await client.$executeRawUnsafe(`
    CREATE TABLE "ExerciseConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "inhaleTime" REAL NOT NULL DEFAULT 4,
      "inhaleHoldTime" REAL NOT NULL DEFAULT 0,
      "exhaleTime" REAL NOT NULL DEFAULT 4,
      "exhaleHoldTime" REAL NOT NULL DEFAULT 0,
      "repetitions" INTEGER NOT NULL DEFAULT 4,
      "extendedHoldEnabled" BOOLEAN NOT NULL DEFAULT false,
      "extendedHoldType" TEXT NOT NULL DEFAULT 'EXHALE',
      "extendedHoldMode" TEXT NOT NULL DEFAULT 'TOLERANCE',
      "extendedHoldDuration" REAL NOT NULL DEFAULT 0,
      "secondExtendedHoldEnabled" BOOLEAN NOT NULL DEFAULT false,
      "secondExtendedHoldType" TEXT NOT NULL DEFAULT 'INHALE',
      "targetSets" INTEGER NOT NULL DEFAULT 0,
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" INTEGER NOT NULL DEFAULT 0,
      "updatedAt" INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE TABLE "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "configId" TEXT,
      "configSnapshot" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      "targetSets" INTEGER NOT NULL DEFAULT 0,
      "completedSets" INTEGER NOT NULL DEFAULT 0,
      "startedAt" INTEGER NOT NULL DEFAULT 0,
      "completedAt" INTEGER,
      "notes" TEXT,
      CONSTRAINT "Session_configId_fkey"
        FOREIGN KEY ("configId") REFERENCES "ExerciseConfig" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE TABLE "SessionSet" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionId" TEXT NOT NULL,
      "setNumber" INTEGER NOT NULL,
      "completedRepetitions" INTEGER NOT NULL DEFAULT 0,
      "startedAt" INTEGER NOT NULL DEFAULT 0,
      "completedAt" INTEGER,
      "notes" TEXT,
      CONSTRAINT "SessionSet_sessionId_fkey"
        FOREIGN KEY ("sessionId") REFERENCES "Session" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE TABLE "ExtendedHold" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "setId" TEXT NOT NULL,
      "holdNumber" INTEGER NOT NULL DEFAULT 1,
      "type" TEXT NOT NULL,
      "mode" TEXT NOT NULL,
      "targetDuration" REAL,
      "actualDuration" REAL NOT NULL,
      "completedAt" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "ExtendedHold_setId_fkey"
        FOREIGN KEY ("setId") REFERENCES "SessionSet" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
}

async function importOperationsWithTempDatabase(): Promise<OperationsModule> {
  vi.resetModules();
  delete (globalThis as { prisma?: PrismaClient }).prisma;

  dbPath = join(tmpdir(), `breath-in-flow-${randomUUID()}.db`);
  process.env.DATABASE_URL = `file:${dbPath}`;

  const clientModule = await import('../src/client');
  prisma = clientModule.prisma;
  await createTestSchema(prisma);

  return import('../src/operations');
}

describe('Database Operations', () => {
  beforeEach(async () => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    operations = await importOperationsWithTempDatabase();
  });

  afterEach(async () => {
    await prisma.$disconnect();
    delete (globalThis as { prisma?: PrismaClient }).prisma;

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    for (const path of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`, `${dbPath}-journal`]) {
      if (existsSync(path)) {
        rmSync(path);
      }
    }
  });

  it('creates, updates, defaults, and deletes exercise configs', async () => {
    const first = await operations.createConfig({
      name: 'Box Breathing',
      inhaleTime: 4,
      exhaleTime: 4,
      repetitions: 5,
    });
    const second = await operations.createConfig({
      name: 'Recovery',
      inhaleTime: 3,
      exhaleTime: 6,
    });

    expect(first.id).toBeDefined();
    expect(first.name).toBe('Box Breathing');
    expect(first.inhaleHoldTime).toBe(0);

    await operations.setDefaultConfig(first.id);
    expect((await operations.getDefaultConfig())?.id).toBe(first.id);

    await operations.setDefaultConfig(second.id);
    expect((await operations.getDefaultConfig())?.id).toBe(second.id);
    expect((await operations.getConfig(first.id))?.isDefault).toBe(false);

    const updated = await operations.updateConfig(first.id, {
      name: 'Updated Box Breathing',
      targetSets: 3,
    });
    expect(updated.name).toBe('Updated Box Breathing');
    expect(updated.targetSets).toBe(3);

    const configs = await operations.getAllConfigs();
    expect(configs.map((config) => config.id).sort()).toEqual([first.id, second.id].sort());

    await operations.deleteConfig(first.id);
    expect(await operations.getConfig(first.id)).toBeNull();
  });

  it('preserves the previous default when the requested config does not exist', async () => {
    const original = await operations.createConfig({ name: 'Keep default', isDefault: true });
    const other = await operations.createConfig({ name: 'Other config' });

    await expect(operations.setDefaultConfig(randomUUID())).rejects.toThrow();

    expect((await operations.getDefaultConfig())?.id).toBe(original.id);
    expect((await operations.getConfig(other.id))?.isDefault).toBe(false);
  });

  it('records sessions, sets, holds, and aggregate stats', async () => {
    const config = await operations.createConfig({
      name: 'Timed Hold',
      extendedHoldEnabled: true,
      extendedHoldMode: 'TIMED',
      extendedHoldDuration: 30,
      targetSets: 1,
    });
    const session = await operations.createSession({
      configId: config.id,
      configSnapshot: JSON.stringify({ name: config.name }),
      targetSets: 1,
      notes: 'Baseline',
    });
    const set = await operations.createSet({
      sessionId: session.id,
      setNumber: 1,
      notes: 'Smooth set',
    });

    await operations.createExtendedHold({
      setId: set.id,
      holdNumber: 1,
      type: 'EXHALE',
      mode: 'TIMED',
      targetDuration: 30,
      actualDuration: 28,
    });
    await operations.createExtendedHold({
      setId: set.id,
      holdNumber: 2,
      type: 'INHALE',
      mode: 'TOLERANCE',
      actualDuration: 42,
    });

    const completedSet = await operations.completeSet(set.id, 5);
    expect(completedSet.completedRepetitions).toBe(5);
    expect(completedSet.completedAt).toBeInstanceOf(Date);

    await operations.updateSession(session.id, { completedSets: 1 });
    const completedSession = await operations.completeSession(session.id);
    expect(completedSession.status).toBe('COMPLETED');
    expect(completedSession.completedAt).toBeInstanceOf(Date);

    const fetched = await operations.getSession(session.id);
    expect(fetched?.sets).toHaveLength(1);
    expect(fetched?.sets[0].extendedHolds).toHaveLength(2);
    expect(fetched?.sets[0].extendedHolds.map((hold) => hold.actualDuration).sort()).toEqual([
      28, 42,
    ]);

    expect(await operations.getRecentSessions(1)).toHaveLength(1);
    expect(await operations.getAllSessions()).toHaveLength(1);

    const stats = await operations.getSessionStats();
    expect(stats).toEqual({
      totalSessions: 1,
      totalSets: 1,
      totalExtendedHolds: 2,
      avgHoldTime: 35,
      maxHoldTime: 42,
    });

    const configStats = await operations.getConfigStats(config.id);
    expect(configStats).toEqual({
      totalSessions: 1,
      totalSets: 1,
    });
  });

  it('cancels and deletes sessions with related rows', async () => {
    const session = await operations.createSession({
      configSnapshot: JSON.stringify({ name: 'Ad hoc' }),
    });
    const set = await operations.createSet({
      sessionId: session.id,
      setNumber: 1,
    });
    await operations.createExtendedHold({
      setId: set.id,
      type: 'EXHALE',
      mode: 'TOLERANCE',
      actualDuration: 15,
    });

    const cancelled = await operations.cancelSession(session.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.completedAt).toBeInstanceOf(Date);

    await operations.deleteSession(session.id);
    expect(await operations.getSession(session.id)).toBeNull();
    expect(await operations.getSessionStats()).toEqual({
      totalSessions: 0,
      totalSets: 0,
      totalExtendedHolds: 0,
      avgHoldTime: 0,
      maxHoldTime: 0,
    });
  });
});

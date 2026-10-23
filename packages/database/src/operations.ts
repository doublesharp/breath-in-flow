import { prisma } from './client';
import type { ExerciseConfig, Session, SessionSet, ExtendedHold } from '@prisma/client';

// ============================================
// Practice Config Operations
// ============================================

export interface CreateConfigInput {
  name: string;
  inhaleTime?: number;
  inhaleHoldTime?: number;
  exhaleTime?: number;
  exhaleHoldTime?: number;
  repetitions?: number;
  extendedHoldEnabled?: boolean;
  extendedHoldType?: string;
  extendedHoldMode?: string;
  extendedHoldDuration?: number;
  secondExtendedHoldEnabled?: boolean;
  secondExtendedHoldType?: string;
  targetSets?: number;
  isDefault?: boolean;
}

export async function createConfig(input: CreateConfigInput): Promise<ExerciseConfig> {
  return prisma.exerciseConfig.create({
    data: input,
  });
}

export async function getConfig(id: string): Promise<ExerciseConfig | null> {
  return prisma.exerciseConfig.findUnique({
    where: { id },
  });
}

export async function getAllConfigs(): Promise<ExerciseConfig[]> {
  return prisma.exerciseConfig.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateConfig(
  id: string,
  input: Partial<CreateConfigInput>
): Promise<ExerciseConfig> {
  return prisma.exerciseConfig.update({
    where: { id },
    data: input,
  });
}

export async function deleteConfig(id: string): Promise<void> {
  await prisma.exerciseConfig.delete({
    where: { id },
  });
}

export async function getDefaultConfig(): Promise<ExerciseConfig | null> {
  return prisma.exerciseConfig.findFirst({
    where: { isDefault: true },
  });
}

export async function setDefaultConfig(id: string): Promise<ExerciseConfig> {
  return prisma.$transaction(async (tx) => {
    await tx.exerciseConfig.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    return tx.exerciseConfig.update({
      where: { id },
      data: { isDefault: true },
    });
  });
}

// ============================================
// Session Operations
// ============================================

export interface CreateSessionInput {
  configId?: string;
  configSnapshot: string; // JSON string
  targetSets?: number;
  notes?: string;
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  return prisma.session.create({
    data: {
      ...input,
      status: 'IN_PROGRESS',
      completedSets: 0,
    },
  });
}

export async function getSession(id: string): Promise<Session | null> {
  return prisma.session.findUnique({
    where: { id },
    include: {
      sets: {
        include: {
          extendedHolds: true,
        },
        orderBy: { setNumber: 'asc' },
      },
    },
  });
}

export async function getAllSessions(): Promise<Session[]> {
  return prisma.session.findMany({
    orderBy: { startedAt: 'desc' },
    include: {
      config: true,
      sets: {
        include: {
          extendedHolds: true,
        },
      },
    },
  });
}

export async function getRecentSessions(limit: number = 10): Promise<Session[]> {
  return prisma.session.findMany({
    take: limit,
    orderBy: { startedAt: 'desc' },
    include: {
      config: true,
      sets: {
        include: {
          extendedHolds: true,
        },
      },
    },
  });
}

export async function updateSession(
  id: string,
  data: Partial<{
    status: string;
    completedSets: number;
    completedAt: Date;
    notes: string;
  }>
): Promise<Session> {
  return prisma.session.update({
    where: { id },
    data,
  });
}

export async function completeSession(id: string): Promise<Session> {
  return prisma.session.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
}

export async function cancelSession(id: string): Promise<Session> {
  return prisma.session.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
    },
  });
}

export async function deleteSession(id: string): Promise<void> {
  await prisma.session.delete({
    where: { id },
  });
}

// ============================================
// Session Set Operations
// ============================================

export interface CreateSetInput {
  sessionId: string;
  setNumber: number;
  completedRepetitions?: number;
  notes?: string;
}

export async function createSet(input: CreateSetInput): Promise<SessionSet> {
  return prisma.sessionSet.create({
    data: input,
  });
}

export async function updateSet(
  id: string,
  data: Partial<{
    completedRepetitions: number;
    completedAt: Date;
    notes: string;
  }>
): Promise<SessionSet> {
  return prisma.sessionSet.update({
    where: { id },
    data,
  });
}

export async function completeSet(id: string, completedRepetitions: number): Promise<SessionSet> {
  return prisma.sessionSet.update({
    where: { id },
    data: {
      completedRepetitions,
      completedAt: new Date(),
    },
  });
}

// ============================================
// Extended Hold Operations
// ============================================

export interface CreateExtendedHoldInput {
  setId: string;
  holdNumber?: number;
  type: string;
  mode: string;
  targetDuration?: number;
  actualDuration: number;
}

export async function createExtendedHold(input: CreateExtendedHoldInput): Promise<ExtendedHold> {
  return prisma.extendedHold.create({
    data: input,
  });
}

// ============================================
// Statistics
// ============================================

export async function getSessionStats() {
  const sessions = await prisma.session.findMany({
    where: { status: 'COMPLETED' },
    include: {
      sets: {
        include: {
          extendedHolds: true,
        },
      },
    },
  });

  const totalSessions = sessions.length;
  const totalSets = sessions.reduce((acc, s) => acc + s.sets.length, 0);
  const totalExtendedHolds = sessions.reduce(
    (acc, s) => acc + s.sets.reduce((a, set) => a + set.extendedHolds.length, 0),
    0
  );

  // Calculate average hold times
  const allHolds = sessions.flatMap((s) => s.sets.flatMap((set) => set.extendedHolds));
  const avgHoldTime =
    allHolds.length > 0
      ? allHolds.reduce((acc, h) => acc + h.actualDuration, 0) / allHolds.length
      : 0;

  const maxHoldTime = allHolds.length > 0 ? Math.max(...allHolds.map((h) => h.actualDuration)) : 0;

  return {
    totalSessions,
    totalSets,
    totalExtendedHolds,
    avgHoldTime,
    maxHoldTime,
  };
}

export async function getConfigStats(configId: string) {
  const sessions = await prisma.session.findMany({
    where: {
      configId,
      status: 'COMPLETED',
    },
    include: {
      sets: {
        include: {
          extendedHolds: true,
        },
      },
    },
  });

  return {
    totalSessions: sessions.length,
    totalSets: sessions.reduce((acc, s) => acc + s.sets.length, 0),
  };
}

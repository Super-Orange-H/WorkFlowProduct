import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/core/db';
import { n8nWorkflow } from '@/config/db/schema';

export type N8nWorkflowRecord = typeof n8nWorkflow.$inferSelect;
export type NewN8nWorkflowRecord = typeof n8nWorkflow.$inferInsert;
export type UpdateN8nWorkflowRecord = Partial<
  Omit<NewN8nWorkflowRecord, 'id' | 'createdAt'>
>;

export enum N8nWorkflowStatus {
  CREATED = 'created',
  DELETED = 'deleted',
}

export async function createN8nWorkflowRecord(
  newRecord: NewN8nWorkflowRecord,
  tx?: any
): Promise<N8nWorkflowRecord> {
  const executor = tx || db();
  const [result] = await executor
    .insert(n8nWorkflow)
    .values(newRecord)
    .returning();

  return result;
}

export async function getN8nWorkflowRecords({
  userId,
  status = N8nWorkflowStatus.CREATED,
  page = 1,
  limit = 20,
}: {
  userId: string;
  status?: N8nWorkflowStatus;
  page?: number;
  limit?: number;
}): Promise<N8nWorkflowRecord[]> {
  return db()
    .select()
    .from(n8nWorkflow)
    .where(
      and(
        eq(n8nWorkflow.userId, userId),
        eq(n8nWorkflow.status, status),
        isNull(n8nWorkflow.deletedAt)
      )
    )
    .orderBy(desc(n8nWorkflow.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
}

export async function getN8nWorkflowRecordsCount({
  userId,
  status = N8nWorkflowStatus.CREATED,
}: {
  userId: string;
  status?: N8nWorkflowStatus;
}): Promise<number> {
  const [result] = await db()
    .select({ count: count() })
    .from(n8nWorkflow)
    .where(
      and(
        eq(n8nWorkflow.userId, userId),
        eq(n8nWorkflow.status, status),
        isNull(n8nWorkflow.deletedAt)
      )
    );

  return result?.count || 0;
}

export async function findN8nWorkflowRecordById(
  id: string
): Promise<N8nWorkflowRecord | undefined> {
  const [result] = await db()
    .select()
    .from(n8nWorkflow)
    .where(eq(n8nWorkflow.id, id))
    .limit(1);

  return result;
}

export async function updateN8nWorkflowRecord(
  id: string,
  updateRecord: UpdateN8nWorkflowRecord
): Promise<N8nWorkflowRecord | undefined> {
  const [result] = await db()
    .update(n8nWorkflow)
    .set(updateRecord)
    .where(eq(n8nWorkflow.id, id))
    .returning();

  return result;
}

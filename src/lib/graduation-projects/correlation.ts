/**
 * Correlation-ID generation and retry reuse for GP mutating RPCs.
 * Same logical user action must reuse p_correlation_id on retry so the
 * backend can return the prior result without double mutation.
 */

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export type CorrelationScope =
  | "create_team"
  | "add_member"
  | "remove_member"
  | "upsert_proposal"
  | "submit_proposal"
  | "resubmit_proposal"
  | "review_proposal"
  | "assign_supervisor"
  | "respond_supervision"
  | "submit_progress"
  | "review_progress"
  | "submit_final"
  | "review_final"
  | "schedule_defense"
  | "assign_committee"
  | "mark_defense_held"
  | "submit_evaluation"
  | "conclude_result"
  | "archive"
  | "register_file"
  | "finalize_file"
  | "signed_download"
  | string;

export function correlationKey(
  scope: CorrelationScope,
  projectId?: string | null,
  entityId?: string | null,
): string {
  return [scope, projectId ?? "", entityId ?? ""].join(":");
}

/** In-memory store for retry reuse within a browser session / test harness. */
export class CorrelationIdStore {
  private readonly ids = new Map<string, string>();

  /** Returns existing id for key, or creates and stores a new one. */
  getOrCreate(key: string, create: () => string = newCorrelationId): string {
    const existing = this.ids.get(key);
    if (existing) return existing;
    const id = create();
    this.ids.set(key, id);
    return id;
  }

  peek(key: string): string | undefined {
    return this.ids.get(key);
  }

  /** Call after a definitive success so a later distinct action gets a new id. */
  clear(key: string): void {
    this.ids.delete(key);
  }

  clearAll(): void {
    this.ids.clear();
  }
}

export const defaultCorrelationStore = new CorrelationIdStore();

/**
 * Resolve correlation id for a mutation: explicit override wins; otherwise
 * reuse store entry for the logical action key (safe retries).
 */
export function resolveCorrelationId(input: {
  correlationId?: string | null;
  scope: CorrelationScope;
  projectId?: string | null;
  entityId?: string | null;
  store?: CorrelationIdStore;
  reuseOnRetry?: boolean;
}): string {
  if (input.correlationId) return input.correlationId;
  const reuse = input.reuseOnRetry !== false;
  const store = input.store ?? defaultCorrelationStore;
  const key = correlationKey(input.scope, input.projectId, input.entityId);
  if (reuse) return store.getOrCreate(key);
  const id = newCorrelationId();
  store.clear(key);
  return id;
}

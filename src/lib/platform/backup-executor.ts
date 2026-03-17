export type TenantSnapshotRequest = {
  tenantId: string;
  initiatedBy: string;
  tierKey?: string;
  reason?: string;
};

export type TenantSnapshotResult = {
  snapshotReference: string;
  snapshotType: "logical" | "full" | "pitr_marker";
  capturedAt: string;
  expiresAt: string | null;
  storagePath: string;
  metadata?: Record<string, unknown>;
};

export type TenantRestoreRequest = {
  tenantId: string;
  snapshotReference?: string;
  backupPointInTime?: string;
  target: "production" | "staging_tenant" | "staging_workspace";
  stagingTenantId?: string | null;
  initiatedBy: string;
  reason: string;
};

export type TenantRestoreResult = {
  executionId: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  message: string;
  metadata?: Record<string, unknown>;
};

export interface TenantBackupExecutionProvider {
  createTenantSnapshot(input: TenantSnapshotRequest): Promise<TenantSnapshotResult>;
  restoreTenantSnapshot(input: TenantRestoreRequest): Promise<TenantRestoreResult>;
}

class StubTenantBackupExecutionProvider implements TenantBackupExecutionProvider {
  async createTenantSnapshot(input: TenantSnapshotRequest): Promise<TenantSnapshotResult> {
    const timestamp = new Date().toISOString();
    const suffix = Math.random().toString(36).slice(2, 10);
    return {
      snapshotReference: `stub-${input.tenantId}-${suffix}`,
      snapshotType: "logical",
      capturedAt: timestamp,
      expiresAt: null,
      storagePath: `tenants/${input.tenantId}/snapshots/${suffix}.json`,
      metadata: {
        provider: "stub",
        note: "Infrastructure backup integration is not configured yet."
      }
    };
  }

  async restoreTenantSnapshot(input: TenantRestoreRequest): Promise<TenantRestoreResult> {
    return {
      executionId: `restore-${Math.random().toString(36).slice(2, 10)}`,
      status: "queued",
      message:
        "Restore request accepted by stub provider. Connect infrastructure restore implementation to execute.",
      metadata: {
        provider: "stub",
        tenantId: input.tenantId,
        target: input.target
      }
    };
  }
}

let provider: TenantBackupExecutionProvider = new StubTenantBackupExecutionProvider();

export function setTenantBackupExecutionProvider(nextProvider: TenantBackupExecutionProvider) {
  provider = nextProvider;
}

export function getTenantBackupExecutionProvider(): TenantBackupExecutionProvider {
  return provider;
}

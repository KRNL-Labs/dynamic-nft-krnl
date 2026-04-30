export const normalizeKrnlReturnedIntentId = (
  intentId: string | null | undefined
): string | null => {
  if (typeof intentId !== "string") return null;
  const trimmed = intentId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const extractTxIntentIdFromWorkflow = (workflowJson: unknown): string | null => {
  if (!workflowJson || typeof workflowJson !== "object" || Array.isArray(workflowJson)) {
    return null;
  }
  const payload = workflowJson as Record<string, any>;
  const intentId = payload?.intent?.id;
  if (typeof intentId !== "string") return null;
  const trimmed = intentId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const resolveCanonicalWorkflowIntentId = (args: {
  workflowJson: unknown;
  krnlIntentId?: string | null;
}): string | null => {
  const fromPayload = extractTxIntentIdFromWorkflow(args.workflowJson);
  if (fromPayload) return fromPayload;
  return normalizeKrnlReturnedIntentId(args.krnlIntentId);
};

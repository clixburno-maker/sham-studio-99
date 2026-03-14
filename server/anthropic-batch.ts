import Anthropic from "@anthropic-ai/sdk";

const defaultAnthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getClient(userApiKey?: string): Anthropic {
  if (userApiKey) {
    return new Anthropic({ apiKey: userApiKey });
  }
  return defaultAnthropic;
}

export interface BatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };
}

export interface BatchStatus {
  batchId: string;
  status: "in_progress" | "canceling" | "ended";
  requestCounts?: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  createdAt?: string;
}

export interface BatchResultItem {
  custom_id: string;
  success: boolean;
  text?: string;
  error?: string;
}

export async function submitBatch(
  requests: BatchRequest[],
  userApiKey?: string
): Promise<BatchStatus> {
  const client = getClient(userApiKey);
  const batch = await client.messages.batches.create({
    requests: requests.map(r => ({
      custom_id: r.custom_id,
      params: r.params,
    })),
  });

  return {
    batchId: batch.id,
    status: batch.processing_status,
    requestCounts: batch.request_counts,
    createdAt: batch.created_at,
  };
}

export async function checkBatchStatus(
  batchId: string,
  userApiKey?: string
): Promise<BatchStatus> {
  const client = getClient(userApiKey);
  const batch = await client.messages.batches.retrieve(batchId);
  return {
    batchId: batch.id,
    status: batch.processing_status,
    requestCounts: batch.request_counts,
    createdAt: batch.created_at,
  };
}

export async function getBatchResults(
  batchId: string,
  userApiKey?: string
): Promise<BatchResultItem[]> {
  const client = getClient(userApiKey);
  const resultsStream = await client.messages.batches.results(batchId);
  const results: BatchResultItem[] = [];

  for await (const entry of resultsStream) {
    if (entry.result.type === "succeeded") {
      const textBlock = entry.result.message.content.find(
        (c: any) => c.type === "text"
      );
      results.push({
        custom_id: entry.custom_id,
        success: true,
        text: textBlock ? (textBlock as any).text : undefined,
      });
    } else if (entry.result.type === "errored") {
      results.push({
        custom_id: entry.custom_id,
        success: false,
        error: (entry.result as any).error?.message || "Batch request errored",
      });
    } else if (entry.result.type === "canceled") {
      results.push({
        custom_id: entry.custom_id,
        success: false,
        error: "Request was canceled",
      });
    } else if (entry.result.type === "expired") {
      results.push({
        custom_id: entry.custom_id,
        success: false,
        error: "Request expired",
      });
    }
  }

  return results;
}

export async function pollBatchUntilDone(
  batchId: string,
  userApiKey?: string,
  onProgress?: (status: BatchStatus, elapsed: number) => void,
  maxWaitMs: number = 24 * 60 * 60 * 1000,
): Promise<BatchResultItem[]> {
  const startTime = Date.now();
  let pollInterval = 5000;
  const maxPollInterval = 60000;

  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 5;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitMs) {
      throw new Error(`Batch ${batchId} did not complete within ${Math.round(maxWaitMs / 60000)} minutes`);
    }

    try {
      const status = await checkBatchStatus(batchId, userApiKey);
      consecutiveErrors = 0;
      onProgress?.(status, elapsed);

      if (status.status === "ended") {
        return await getBatchResults(batchId, userApiKey);
      }
    } catch (err: any) {
      consecutiveErrors++;
      console.warn(`Batch ${batchId} poll error (${consecutiveErrors}/${maxConsecutiveErrors}): ${err.message}`);
      if (consecutiveErrors >= maxConsecutiveErrors) {
        throw new Error(`Batch ${batchId} polling failed after ${maxConsecutiveErrors} consecutive errors: ${err.message}`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
  }
}

export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

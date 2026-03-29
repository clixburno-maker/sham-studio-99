import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";

function getClient(userApiKey?: string): Anthropic {
  const key = userApiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "No Anthropic API key found. Please enter your API key in Settings (gear icon) or set the ANTHROPIC_API_KEY environment variable."
    );
  }
  return new Anthropic({ apiKey: key });
}

export interface StreamRequestParams {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface StreamResult {
  custom_id: string;
  success: boolean;
  text?: string;
  error?: string;
}

export async function streamSingleRequest(
  params: StreamRequestParams,
  userApiKey?: string,
): Promise<string> {
  const client = getClient(userApiKey);
  const stream = client.messages.stream(params);
  const message = await stream.finalMessage();

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  if (message.stop_reason === "max_tokens") {
    console.warn("Streaming response truncated (max_tokens). Attempting to use partial result...");
  }

  return content.text;
}

async function streamWithRetry(
  params: StreamRequestParams,
  userApiKey?: string,
  maxRetries: number = 2,
): Promise<string> {
  const RETRY_DELAYS = [3000, 8000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await streamSingleRequest(params, userApiKey);
    } catch (err: any) {
      const msg = err.message || "";
      const status = err.status || err.statusCode || 0;

      const isRetryable = status === 429 || status === 503 || status === 529 || status >= 500
        || msg.includes("overloaded") || msg.includes("rate") || msg.includes("capacity");

      if (isRetryable && attempt < maxRetries) {
        const delay = RETRY_DELAYS[attempt] || 8000;
        console.warn(`[stream] Attempt ${attempt + 1} failed (${status || msg.substring(0, 80)}). Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("All retry attempts exhausted");
}

export async function streamParallelRequests(
  requests: Array<{ custom_id: string; params: StreamRequestParams }>,
  userApiKey?: string,
  concurrency: number = 8,
  onProgress?: (completed: number, total: number, custom_id: string) => void,
): Promise<StreamResult[]> {
  const limit = pLimit(concurrency);
  const results: StreamResult[] = [];
  let completed = 0;

  const tasks = requests.map((req) =>
    limit(async () => {
      try {
        const text = await streamWithRetry(req.params, userApiKey);
        completed++;
        onProgress?.(completed, requests.length, req.custom_id);
        const result: StreamResult = { custom_id: req.custom_id, success: true, text };
        results.push(result);
        return result;
      } catch (err: any) {
        completed++;
        onProgress?.(completed, requests.length, req.custom_id);
        const result: StreamResult = {
          custom_id: req.custom_id,
          success: false,
          error: err.message || "Streaming request failed",
        };
        results.push(result);
        return result;
      }
    }),
  );

  await Promise.all(tasks);
  return results;
}

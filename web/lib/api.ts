import type { ApiDocument, Citation, IngestionJob, IngestionStage } from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(/\/$/, "");
let apiAccessToken: string | null = null;

type JsonRecord = Record<string, unknown>;

export function setApiAccessToken(token: string | null): void {
  apiAccessToken = token;
}

function apiHeaders(existing?: HeadersInit): Headers {
  const headers = new Headers(existing);
  if (apiAccessToken) headers.set("Authorization", `Bearer ${apiAccessToken}`);
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: init?.body instanceof FormData
        ? apiHeaders(init.headers)
        : apiHeaders({ "Content-Type": "application/json", ...init?.headers }),
    });
  } catch {
    throw new Error("Cannot reach the RAG API. Make sure the Flask service is running.");
  }

  const data = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok || data.success === false) {
    throw new Error(typeof data.error === "string" ? data.error : `Request failed (${response.status})`);
  }
  return data as unknown as T;
}

export async function getDocuments(signal?: AbortSignal): Promise<ApiDocument[]> {
  const result = await request<{ documents?: ApiDocument[] }>("/api/docs", { signal, cache: "no-store" });
  return Array.isArray(result.documents) ? result.documents : [];
}

export async function deleteDocument(documentId: string): Promise<void> {
  await request(`/api/docs/${encodeURIComponent(documentId)}`, { method: "DELETE" });
}

export async function askQuestion(message: string): Promise<{ response: string; citations: Citation[] }> {
  const result = await request<{ response?: string; citations?: Citation[] }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, topK: 5, includeContext: true }),
  });
  return {
    response: result.response || "No answer was returned.",
    citations: Array.isArray(result.citations) ? result.citations : [],
  };
}

export async function uploadDocument(
  file: File,
  onProgress: (job: Partial<IngestionJob>) => void,
): Promise<{ taskId?: string }> {
  const form = new FormData();
  form.append("file", file);
  onProgress({ stage: "uploading", percent: 8, detail: "Sending document to the ingestion service" });

  const asyncEnabled = process.env.NEXT_PUBLIC_ASYNC_INGESTION === "true";
  const result = await request<{
    taskId?: string;
    task_id?: string;
    document?: { processingTime?: string; chunksProcessed?: number };
  }>(asyncEnabled ? "/api/ingestions/upload" : "/api/upload", { method: "POST", body: form });

  const taskId = result.taskId || result.task_id;
  if (taskId) return { taskId };

  // The legacy compatibility endpoint processes synchronously. Reflect its
  // completed stages through the same UI state used by the async pipeline.
  onProgress({
    stage: "verifying",
    percent: 94,
    detail: result.document?.chunksProcessed
      ? `${result.document.chunksProcessed} evidence chunks indexed`
      : "Confirming vector index integrity",
  });
  return {};
}

function normalizeStage(value: unknown): IngestionStage {
  const stage = String(value || "").toLowerCase();
  const allowed: IngestionStage[] = [
    "preparing", "uploading", "parsing", "chunking", "embedding",
    "indexing", "verifying", "complete", "failed",
  ];
  if (allowed.includes(stage as IngestionStage)) return stage as IngestionStage;
  if (["success", "completed", "ready"].includes(stage)) return "complete";
  if (["failure", "error", "revoked"].includes(stage)) return "failed";
  if (stage.includes("parse")) return "parsing";
  if (stage.includes("chunk")) return "chunking";
  if (stage.includes("embed")) return "embedding";
  if (stage.includes("index")) return "indexing";
  return "preparing";
}

function progressFromPayload(payload: JsonRecord): Partial<IngestionJob> {
  const percent = Number(payload.percent ?? payload.progress ?? 0);
  const rawStage = payload.stage ?? payload.status;
  return {
    percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
    stage: normalizeStage(rawStage),
    detail: typeof payload.detail === "string" ? payload.detail : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

export function watchIngestion(
  taskId: string,
  onProgress: (job: Partial<IngestionJob>) => void,
  onComplete: () => void,
  onError: (error: Error) => void,
): () => void {
  let stopped = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const handle = (payload: JsonRecord) => {
    const progress = progressFromPayload(payload);
    onProgress(progress);
    if (progress.stage === "complete" || progress.percent === 100) {
      stopped = true;
      onComplete();
    } else if (progress.stage === "failed") {
      stopped = true;
      onError(new Error(progress.error || "Ingestion failed"));
    }
  };

  const poll = async () => {
      if (stopped) return;
      try {
        const payload = await request<JsonRecord>(`/api/ingestions/${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const job = payload.job && typeof payload.job === "object" ? payload.job as JsonRecord : payload;
        handle(job);
      } catch (error) {
        if (!stopped) onError(error instanceof Error ? error : new Error("Progress lookup failed"));
        return;
      }
      if (!stopped) pollTimer = setTimeout(poll, 1500);
  };

  const stream = async () => {
    const response = await fetch(`${API_URL}/api/ingestions/${encodeURIComponent(taskId)}/events`, {
      headers: apiHeaders({ Accept: "text/event-stream" }),
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new Error(`Progress stream failed (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!stopped) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) {
        const data = event.split("\n").find((line) => line.startsWith("data:"));
        if (!data) continue;
        try { handle(JSON.parse(data.slice(5).trim()) as JsonRecord); } catch { /* ignore malformed events */ }
      }
    }
    if (!stopped) void poll();
  };
  void stream().catch(() => void poll());

  return () => {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
  };
}

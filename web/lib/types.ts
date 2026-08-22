export type WorkspaceView = "documents" | "ask";

export type ApiDocument = {
  document_id: string;
  filename: string;
  file_type?: string;
  total_chunks?: number;
  pinecone_vectors?: number;
  upload_date?: string;
  size_bytes?: number;
  in_index?: boolean;
  status?: string;
};

export type Citation = {
  document_id?: string | null;
  filename?: string | null;
  chunk_index?: number | null;
  page?: number | null;
  page_start?: number | null;
  page_end?: number | null;
  section?: string | null;
  excerpt?: string | null;
  retrieval_score?: number | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: Date;
  status?: "sending" | "complete" | "error";
};

export type IngestionStage =
  | "preparing"
  | "uploading"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexing"
  | "verifying"
  | "complete"
  | "failed";

export type IngestionJob = {
  id: string;
  filename: string;
  stage: IngestionStage;
  percent: number;
  detail?: string;
  error?: string;
  taskId?: string;
};

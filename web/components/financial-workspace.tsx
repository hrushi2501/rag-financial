"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { askQuestion, deleteDocument, getDocuments, uploadDocument, watchIngestion } from "@/lib/api";
import type { ApiDocument, ChatMessage, IngestionJob, WorkspaceView } from "@/lib/types";
import { ChatWorkspace } from "./chat-workspace";
import { ConfirmDialog } from "./confirm-dialog";
import { DocumentLibrary } from "./document-library";
import { Icons } from "./icons";
import { IngestionProgress } from "./ingestion-progress";
import { Sidebar } from "./sidebar";
import { UploadZone } from "./upload-zone";

function messageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function FinancialWorkspace() {
  const [view, setView] = useState<WorkspaceView>("documents");
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState("");
  const [job, setJob] = useState<IngestionJob>();
  const [deleting, setDeleting] = useState<ApiDocument>();
  const [deletingId, setDeletingId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const cleanupWatch = useRef<(() => void) | null>(null);

  const loadDocuments = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingDocs(true);
    try {
      const next = await getDocuments();
      setDocuments(next.sort((a, b) => String(b.upload_date || "").localeCompare(String(a.upload_date || ""))));
      setDocsError("");
    } catch (error) {
      setDocsError(error instanceof Error ? error.message : "Could not load documents.");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
    return () => cleanupWatch.current?.();
  }, [loadDocuments]);

  const finishUpload = useCallback(async (filename: string) => {
    setJob((current) => current ? { ...current, stage: "complete", percent: 100, detail: "Indexed and ready for grounded questions" } : current);
    await loadDocuments(false);
    window.setTimeout(() => setJob((current) => current?.filename === filename ? undefined : current), 6000);
  }, [loadDocuments]);

  const handleUpload = async (file: File) => {
    cleanupWatch.current?.();
    const nextJob: IngestionJob = { id: messageId(), filename: file.name, stage: "preparing", percent: 2, detail: "Validating file" };
    setJob(nextJob);
    try {
      const result = await uploadDocument(file, (progress) => setJob((current) => current ? { ...current, ...progress } : current));
      if (result.taskId) {
        setJob((current) => current ? { ...current, taskId: result.taskId, stage: "parsing", percent: Math.max(current.percent, 12) } : current);
        cleanupWatch.current = watchIngestion(
          result.taskId,
          (progress) => setJob((current) => current ? { ...current, ...progress } : current),
          () => void finishUpload(file.name),
          (error) => setJob((current) => current ? { ...current, stage: "failed", error: error.message } : current),
        );
      } else {
        await finishUpload(file.name);
      }
    } catch (error) {
      setJob((current) => current ? {
        ...current,
        stage: "failed",
        percent: Math.min(current.percent, 90),
        error: error instanceof Error ? error.message : "Upload failed",
      } : current);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingId(deleting.document_id);
    const target = deleting;
    setDeleting(undefined);
    try {
      await deleteDocument(target.document_id);
      setDocuments((current) => current.filter((document) => document.document_id !== target.document_id));
    } catch (error) {
      setDocsError(error instanceof Error ? error.message : "Could not remove the document.");
    } finally {
      setDeletingId("");
    }
  };

  const startAsking = (document: ApiDocument) => {
    setInitialPrompt(`Ask a question about ${document.filename}`);
    setView("ask");
  };

  const sendMessage = async (content: string) => {
    const userMessage: ChatMessage = { id: messageId(), role: "user", content, createdAt: new Date(), status: "complete" };
    const assistantId = messageId();
    const assistant: ChatMessage = { id: assistantId, role: "assistant", content: "", createdAt: new Date(), status: "sending" };
    setMessages((current) => [...current, userMessage, assistant]);
    setSending(true);
    try {
      const result = await askQuestion(content);
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, content: result.response, citations: result.citations, status: "complete" }
        : message));
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, content: error instanceof Error ? error.message : "The answer could not be generated.", status: "error" }
        : message));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="workspace">
      <Sidebar currentView={view} documentCount={documents.length} apiOnline={!docsError} mobileOpen={mobileNav} onNavigate={setView} onClose={() => setMobileNav(false)} />
      <main className="workspace-main">
        <button type="button" className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Icons.menu /></button>
        {view === "documents" ? (
          <div className="documents-view">
            <header className="page-header">
              <div><p className="eyebrow">Financial intelligence workspace</p><h1>Your documents</h1><p>Build a searchable research library and trace every answer back to its source.</p></div>
              <button type="button" className="button button--primary" onClick={() => document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth" })}><Icons.upload size={17} />Add document</button>
            </header>

            <div className="metrics-row">
              <article><span className="metric-icon"><Icons.files /></span><div><strong>{documents.length}</strong><span>Indexed documents</span></div></article>
              <article><span className="metric-icon metric-icon--purple"><Icons.database /></span><div><strong>{documents.reduce((sum, doc) => sum + (doc.total_chunks || 0), 0).toLocaleString()}</strong><span>Evidence chunks</span></div></article>
              <article><span className="metric-icon metric-icon--blue"><Icons.shield /></span><div><strong>{documents.filter((doc) => doc.in_index !== false).length}</strong><span>Ready to query</span></div></article>
            </div>

            <section className="upload-card" id="upload-section">
              <div className="upload-card__heading"><div><p className="eyebrow">Ingest</p><h2>Add source material</h2></div><span className="pipeline-label"><i />Financial-aware pipeline</span></div>
              <UploadZone busy={!!job && !["complete", "failed"].includes(job.stage)} onUpload={handleUpload} />
              {job && <IngestionProgress job={job} onDismiss={() => setJob(undefined)} />}
            </section>

            <DocumentLibrary documents={documents} loading={loadingDocs} error={docsError} deletingId={deletingId} onDelete={setDeleting} onAsk={startAsking} onRetry={() => void loadDocuments()} />
          </div>
        ) : (
          <ChatWorkspace documents={documents} messages={messages} sending={sending} initialPrompt={initialPrompt} onSend={sendMessage} />
        )}
      </main>
      {deleting && <ConfirmDialog document={deleting} onCancel={() => setDeleting(undefined)} onConfirm={() => void confirmDelete()} />}
    </div>
  );
}

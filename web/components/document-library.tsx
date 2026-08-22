"use client";

import { useMemo, useState } from "react";
import { displayFileType, formatBytes, formatDate } from "@/lib/format";
import type { ApiDocument } from "@/lib/types";
import { Icons } from "./icons";

type Props = {
  documents: ApiDocument[];
  loading: boolean;
  error?: string;
  deletingId?: string;
  onDelete: (document: ApiDocument) => void;
  onAsk: (document: ApiDocument) => void;
  onRetry: () => void;
};

export function DocumentLibrary({ documents, loading, error, deletingId, onDelete, onAsk, onRetry }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => documents.filter((doc) => doc.filename.toLowerCase().includes(query.toLowerCase())), [documents, query]);

  return (
    <section className="library-card" aria-labelledby="library-title">
      <div className="library-card__header">
        <div><p className="eyebrow">Knowledge base</p><h2 id="library-title">Document library</h2></div>
        <label className="search-field">
          <Icons.search size={17} />
          <span className="sr-only">Search documents</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><Icons.close size={14} /></button>}
        </label>
      </div>

      {error ? (
        <div className="library-state">
          <span className="state-icon state-icon--error"><Icons.alert /></span>
          <strong>Couldn’t load your library</strong><p>{error}</p>
          <button type="button" className="button button--secondary" onClick={onRetry}><Icons.refresh size={16} />Try again</button>
        </div>
      ) : loading ? (
        <div className="document-list" role="status" aria-label="Loading documents">
          {[0, 1, 2].map((item) => <div className="document-row document-row--skeleton" key={item}><span /><span /><span /></div>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="library-state">
          <span className="state-icon"><Icons.files /></span>
          <strong>{query ? "No matching documents" : "Your research library is empty"}</strong>
          <p>{query ? "Try a different filename." : "Upload your first report to begin asking grounded questions."}</p>
        </div>
      ) : (
        <div className="document-list">
          <div className="document-list__head" aria-hidden="true"><span>Document</span><span>Indexed</span><span>Size</span><span>Status</span><span /></div>
          {filtered.map((document) => {
            const isDeleting = deletingId === document.document_id;
            const indexed = document.in_index !== false;
            return (
              <article className="document-row" key={document.document_id}>
                <button type="button" className="document-main" onClick={() => onAsk(document)} title={`Ask about ${document.filename}`}>
                  <span className={`file-badge file-badge--${displayFileType(document.filename, document.file_type).toLowerCase()}`}>{displayFileType(document.filename, document.file_type)}</span>
                  <span><strong>{document.filename}</strong><small>Added {formatDate(document.upload_date)}</small></span>
                </button>
                <span className="document-cell"><b>{document.total_chunks ?? 0}</b><small>chunks</small></span>
                <span className="document-cell"><b>{formatBytes(document.size_bytes)}</b><small>source</small></span>
                <span className={`status-pill ${indexed ? "status-pill--ready" : "status-pill--pending"}`}><i />{indexed ? "Ready" : "Syncing"}</span>
                <div className="row-actions">
                  <button type="button" className="ask-action" onClick={() => onAsk(document)}>Ask <Icons.arrow size={15} /></button>
                  <button type="button" className="icon-button icon-button--danger" onClick={() => onDelete(document)} disabled={isDeleting} aria-label={`Delete ${document.filename}`}>
                    {isDeleting ? <span className="mini-loader mini-loader--dark" /> : <Icons.trash size={17} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

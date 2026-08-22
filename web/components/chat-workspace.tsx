"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiDocument, ChatMessage, Citation } from "@/lib/types";
import { Icons } from "./icons";

type Props = {
  documents: ApiDocument[];
  messages: ChatMessage[];
  sending: boolean;
  initialPrompt?: string;
  onSend: (message: string) => void;
};

const suggestions = [
  "Summarize the key financial highlights",
  "What are the biggest risks management identified?",
  "Compare revenue and operating margin trends",
];

function AnswerText({ text }: { text: string }) {
  const occurrences = new Map<string, number>();
  return (
    <div className="answer-text">
      {text.split("\n").map((line) => {
        const occurrence = (occurrences.get(line) || 0) + 1;
        occurrences.set(line, occurrence);
        const key = `${line}-${occurrence}`;
        const value = line.trim();
        if (!value) return <span className="answer-space" key={key} />;
        if (/^[•*-]\s/.test(value)) return <p className="answer-bullet" key={key}><span>•</span>{value.replace(/^[•*-]\s*/, "")}</p>;
        return <p key={key}>{value.replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
}

function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  const page = citation.page ?? citation.page_start;
  return (
    <article className="citation-card">
      <div className="citation-card__top">
        <span className="citation-number">{index + 1}</span>
        <div><strong>{citation.filename || "Source document"}</strong><span>{page ? `Page ${page}` : citation.chunk_index != null ? `Evidence chunk ${citation.chunk_index + 1}` : "Retrieved evidence"}{citation.section ? ` · ${citation.section}` : ""}</span></div>
        {citation.retrieval_score != null && <small>{Math.round(citation.retrieval_score * 100)}% match</small>}
      </div>
      {citation.excerpt && <p>“{citation.excerpt}”</p>}
    </article>
  );
}

export function ChatWorkspace({ documents, messages, sending, initialPrompt, onSend }: Props) {
  const [input, setInput] = useState(initialPrompt || "");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length || sending) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const submit = () => {
    const value = input.trim();
    if (!value || sending) return;
    onSend(value);
    setInput("");
  };

  const hasDocuments = documents.length > 0;
  return (
    <section className="chat-shell">
      <div className="chat-topbar">
        <div><p className="eyebrow">Grounded research</p><h1>Ask LedgerLens</h1></div>
        <span className="context-chip"><Icons.database size={15} />{documents.length} {documents.length === 1 ? "document" : "documents"} in context</span>
      </div>

      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-orb"><Icons.sparkle size={28} /></div>
            <h2>Turn filings into answers.</h2>
            <p>{hasDocuments ? "Ask a precise question and I’ll answer from your indexed documents, with the evidence attached." : "Add a financial document first, then ask questions grounded in its contents."}</p>
            <div className="suggestion-grid">
              {suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={!hasDocuments || sending} onClick={() => onSend(suggestion)}>{suggestion}<Icons.arrow size={16} /></button>)}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <div className={`message message--${message.role}`} key={message.id}>
                <div className="message-avatar">{message.role === "assistant" ? <Icons.logo size={18} /> : "You"}</div>
                <div className="message-body">
                  <div className="message-meta"><strong>{message.role === "assistant" ? "LedgerLens" : "You"}</strong><span>{message.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                  {message.status === "sending" ? <div className="typing"><i /><i /><i /><span>Analyzing your documents</span></div> : <AnswerText text={message.content} />}
                  {message.status === "error" && <span className="message-error"><Icons.alert size={14} />Answer failed</span>}
                  {!!message.citations?.length && (
                    <details className="citations" open>
                      <summary><Icons.link size={15} />{message.citations.length} supporting {message.citations.length === 1 ? "source" : "sources"}<Icons.chevron className="summary-chevron" size={14} /></summary>
                      <div className="citation-list">{message.citations.map((citation, index) => <CitationCard key={`${citation.document_id}-${citation.chunk_index ?? citation.page ?? citation.page_start ?? citation.excerpt ?? citation.filename}`} citation={citation} index={index} />)}</div>
                    </details>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
            }}
            disabled={!hasDocuments || sending}
            placeholder={hasDocuments ? "Ask about revenue, risks, guidance, or any disclosed figure…" : "Upload a document to begin…"}
            aria-label="Ask a question about your documents"
            rows={1}
          />
          <button type="button" className="send-button" onClick={submit} disabled={!input.trim() || !hasDocuments || sending} aria-label="Send question"><Icons.send size={18} /></button>
        </div>
        <p><Icons.shield size={13} /> Responses are generated from retrieved evidence. Verify important figures against the cited source.</p>
      </div>
    </section>
  );
}

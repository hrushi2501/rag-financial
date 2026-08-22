"use client";

import { useRef, useState, type DragEvent } from "react";
import { Icons } from "./icons";

const ALLOWED = [".pdf", ".docx", ".xlsx", ".csv", ".txt"];
const MAX_SIZE = 100 * 1024 * 1024;

type Props = { busy?: boolean; onUpload: (file: File) => void };

export function UploadZone({ busy, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const select = (file?: File) => {
    if (!file) return;
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ALLOWED.includes(extension)) {
      setError("Choose a PDF, DOCX, XLSX, CSV, or TXT file.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("This file exceeds the current 100 MB upload limit.");
      return;
    }
    setError("");
    onUpload(file);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    select(event.dataTransfer.files[0]);
  };

  return (
    <div>
      <div
        className={`upload-zone ${dragging ? "is-dragging" : ""} ${busy ? "is-busy" : ""}`}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        <div className="upload-zone__icon"><Icons.upload size={25} /></div>
        <div className="upload-zone__copy">
          <strong>{busy ? "Ingestion in progress" : "Drop a financial document here"}</strong>
          <span>10-Ks, 10-Qs, annual reports, pitchbooks, and spreadsheets</span>
        </div>
        <button type="button" className="button button--secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={ALLOWED.join(",")}
          onChange={(event) => {
            select(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
      <div className="upload-zone__meta">
        <span>PDF · DOCX · XLSX · CSV · TXT</span>
        <span><Icons.shield size={14} /> Tenant-isolated when authentication is enabled</span>
      </div>
      {error && <p className="field-error" role="alert"><Icons.alert size={15} />{error}</p>}
    </div>
  );
}

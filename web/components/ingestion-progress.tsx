import { stageLabel } from "@/lib/format";
import type { IngestionJob } from "@/lib/types";
import { Icons } from "./icons";

type Props = { job: IngestionJob; onDismiss?: () => void };

const pipeline = ["uploading", "parsing", "chunking", "embedding", "indexing", "complete"];

export function IngestionProgress({ job, onDismiss }: Props) {
  const failed = job.stage === "failed";
  const complete = job.stage === "complete";
  const activeIndex = pipeline.indexOf(job.stage === "verifying" ? "indexing" : job.stage);

  return (
    <section className={`ingestion-card ${failed ? "ingestion-card--failed" : ""}`} aria-live="polite">
      <div className="ingestion-card__top">
        <div className={`progress-icon ${complete ? "is-complete" : failed ? "is-failed" : ""}`}>
          {complete ? <Icons.check /> : failed ? <Icons.alert /> : <span className="mini-loader" />}
        </div>
        <div className="ingestion-card__copy">
          <div className="ingestion-card__title"><strong>{job.filename}</strong><span>{job.percent}%</span></div>
          <p>{failed ? job.error : job.detail || stageLabel(job.stage)}</p>
        </div>
        {(complete || failed) && onDismiss && <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss"><Icons.close size={17} /></button>}
      </div>
      <div className="progress-track" aria-label={`${job.percent}% complete`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.percent}>
        <span className={failed ? "is-failed" : ""} style={{ width: `${job.percent}%` }} />
      </div>
      {!failed && !complete && (
        <div className="pipeline-steps" aria-hidden="true">
          {pipeline.map((step, index) => (
            <span key={step} className={index <= activeIndex ? "is-done" : ""}>{step === "complete" ? "Ready" : step}</span>
          ))}
        </div>
      )}
    </section>
  );
}

import { STAGES, type RoadmapStatus, type SpecStatus, type Stage } from '@/lib/schema';

/** Human labels for roadmap statuses, matching the legend in `specs/roadmap.md`. */
export const STATUS_LABEL: Record<RoadmapStatus, string> = {
  'not-started': 'Not started',
  drafted: 'Spec drafted',
  approved: 'Spec approved',
  'in-progress': 'In progress',
  done: 'Done',
};

const STATUS_ICON: Record<RoadmapStatus, string> = {
  'not-started': '⬜',
  drafted: '📝',
  approved: '✅',
  'in-progress': '🚧',
  done: '✔️',
};

const SPEC_STATUS_LABEL: Record<SpecStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  'in-progress': 'In progress',
  implemented: 'Implemented',
  superseded: 'Superseded',
};

const SPEC_STATUS_TONE: Record<SpecStatus, RoadmapStatus> = {
  draft: 'drafted',
  approved: 'approved',
  'in-progress': 'in-progress',
  implemented: 'done',
  superseded: 'not-started',
};

export const STAGE_LABEL: Record<Stage, string> = {
  spec: 'Spec',
  plan: 'Plan',
  tasks: 'Tasks',
  implementing: 'Implementing',
  verified: 'Verified',
};

/** A roadmap status as an icon plus label. */
export function StatusBadge({ status }: { status: RoadmapStatus }): React.JSX.Element {
  return (
    <span className={`badge status-${status}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span> {STATUS_LABEL[status]}
    </span>
  );
}

/** A feature spec's own status (Draft, Approved, Implemented…). */
export function SpecStatusBadge({ status }: { status: SpecStatus }): React.JSX.Element {
  return <span className={`badge status-${SPEC_STATUS_TONE[status]}`}>{SPEC_STATUS_LABEL[status]}</span>;
}

/** The five workflow stages with the current one highlighted. */
export function StageSteps({ stage }: { stage: Stage }): React.JSX.Element {
  const current = STAGES.indexOf(stage);
  return (
    <ol className="stage-steps" aria-label={`Stage: ${STAGE_LABEL[stage]}`}>
      {STAGES.map((step, index) => (
        <li key={step} className={index < current ? 'past' : index === current ? 'current' : 'future'}>
          {STAGE_LABEL[step]}
        </li>
      ))}
    </ol>
  );
}

/** `done / total` with a bar; shows a dash when there is nothing to count. */
export function Progress({ label, done, total }: { label: string; done: number; total: number }): React.JSX.Element {
  if (total === 0) {
    return <span className="progress empty">{label}: —</span>;
  }
  const percent = Math.round((done / total) * 100);
  return (
    <span className="progress" title={`${label}: ${done} of ${total} (${percent}%)`}>
      <span className="progress-label">
        {label} {done}/{total}
      </span>
      <span className="progress-track" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

/** A tracking file that couldn't be read or failed validation (AC-7). */
export function FileProblem({ file, error }: { file: string; error: string }): React.JSX.Element {
  return (
    <div className="file-problem" role="alert">
      <strong className="mono">{file}</strong>
      <span>{error}</span>
    </div>
  );
}

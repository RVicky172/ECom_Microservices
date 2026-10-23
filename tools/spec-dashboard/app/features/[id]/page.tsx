import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileProblem, Progress, SpecStatusBadge, StageSteps } from '@/components/Badges';
import { Markdown } from '@/components/Markdown';
import { Tabs, type Tab } from '@/components/Tabs';
import { loadFeature } from '@/lib/repo';

export const dynamic = 'force-dynamic';

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  note?: string;
}

function Checklist({ items, empty }: { items: ChecklistItem[]; empty: string }): React.JSX.Element {
  if (items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="checklist">
      {items.map((item) => (
        <li key={item.id} className={item.done ? 'done' : ''}>
          <span className="check" aria-label={item.done ? 'done' : 'not done'}>{item.done ? '✓' : ''}</span>
          <span className="mono">{item.id}</span>
          <span>
            {item.label}
            {item.note && <small className="item-note">{item.note}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** `/features/[id]` — a feature's tracking data from feature.json, plus its rendered documents. */
export default async function FeaturePage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  const detail = await loadFeature(id);
  if (!detail) notFound();

  const { feature, documents: docs } = detail;
  const documents: Tab[] = (
    [
      ['spec', 'spec.md', docs.spec],
      ['plan', 'plan.md', docs.plan],
      ['tasks', 'tasks.md', docs.tasks],
    ] as const
  )
    .filter(([, , content]) => content !== undefined)
    .map(([tabId, label, content]) => ({ id: tabId, label, content: <Markdown>{content ?? ''}</Markdown> }));

  const breadcrumb = (
    <p className="breadcrumb">
      <Link href="/">Overview</Link> / <span className="mono">{detail.folder}</span>
    </p>
  );

  if (!feature.ok) {
    return (
      <>
        {breadcrumb}
        <section className="card attention">
          <h2>This feature&apos;s tracking file can&apos;t be read</h2>
          <FileProblem file={feature.file} error={feature.error} />
        </section>
        {documents.length > 0 && (
          <section className="card">
            <h2>Documents</h2>
            <Tabs tabs={documents} />
          </section>
        )}
      </>
    );
  }

  const data = feature.data;
  const unresolved = data.openQuestions.filter((question) => !question.resolved);
  const doneCount = (items: { done: boolean }[]) => items.filter((item) => item.done).length;

  return (
    <>
      {breadcrumb}
      <section className="hero">
        <p className="eyebrow">
          Feature {data.id} · Phase {data.phase} · updated {data.updated}
        </p>
        <h1>{data.title}</h1>
        <div className="hero-meta">
          <SpecStatusBadge status={data.status} />
          <Progress label="Acceptance criteria" done={doneCount(data.acceptanceCriteria)} total={data.acceptanceCriteria.length} />
          <Progress label="Tasks" done={doneCount(data.tasks)} total={data.tasks.length} />
        </div>
        <StageSteps stage={data.stage} />
        {data.summary && <p className="summary">{data.summary}</p>}
      </section>

      {unresolved.length > 0 && (
        <section className="card attention" aria-label="Open questions">
          <h2>Needs clarification ({unresolved.length})</h2>
          <Checklist items={unresolved.map((question) => ({ id: question.id, label: question.text, done: false }))} empty="" />
        </section>
      )}

      <div className="two-col">
        <section className="card">
          <h2>Acceptance criteria</h2>
          <Checklist
            items={data.acceptanceCriteria.map((criterion) => ({
              id: criterion.id,
              label: criterion.text,
              done: criterion.done,
              note: criterion.test,
            }))}
            empty="No acceptance criteria yet."
          />
        </section>
        <section className="card">
          <h2>Tasks</h2>
          <Checklist
            items={data.tasks.map((task) => ({ id: task.id, label: task.title, done: task.done, note: task.result }))}
            empty="No tasks yet."
          />
        </section>
      </div>

      <section className="card">
        <h2>Documents</h2>
        {documents.length > 0 ? <Tabs tabs={documents} /> : <p className="muted">No documents in this folder.</p>}
      </section>
    </>
  );
}

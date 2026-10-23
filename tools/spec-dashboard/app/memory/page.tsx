import { Markdown } from '@/components/Markdown';
import { PROGRESS_LIMIT } from '@/lib/parse/memory';
import { loadMemory } from '@/lib/repo';

export const dynamic = 'force-dynamic';

/** `/memory` — current state, recent progress, decisions and learnings from `memory/`. */
export default async function MemoryPage(): Promise<React.JSX.Element> {
  const memory = await loadMemory();

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Project memory</p>
        <h1>{memory.currentState.title}</h1>
        {memory.currentState.body ? <Markdown>{memory.currentState.body}</Markdown> : <p className="muted">Nothing recorded.</p>}
      </section>

      <section className="card">
        <h2>Recent progress <span className="muted">({PROGRESS_LIMIT} newest)</span></h2>
        {memory.progress.length === 0 && <p className="muted">No progress entries yet.</p>}
        <ol className="timeline">
          {memory.progress.map((entry) => (
            <li key={`${entry.date}-${entry.title}`}>
              <p className="timeline-head">
                <span className="mono">{entry.date}</span> {entry.title}
              </p>
              <Markdown>{entry.body}</Markdown>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>Decisions <span className="muted">({memory.decisions.length})</span></h2>
        {memory.decisions.length === 0 && <p className="muted">No decisions logged.</p>}
        {memory.decisions.map((decision) => (
          <details key={decision.id} className="disclosure">
            <summary>
              <span className="mono">{decision.id}</span> {decision.title} <span className="muted">{decision.date}</span>
            </summary>
            <Markdown>{decision.body}</Markdown>
          </details>
        ))}
      </section>

      <section className="card">
        <h2>Learnings <span className="muted">({memory.learnings.length} topics)</span></h2>
        {memory.learnings.length === 0 && <p className="muted">No learnings recorded.</p>}
        {memory.learnings.map((learning) => (
          <div key={learning.topic} className="learning">
            <h3>{learning.topic}</h3>
            <Markdown>{learning.body}</Markdown>
          </div>
        ))}
      </section>
    </>
  );
}

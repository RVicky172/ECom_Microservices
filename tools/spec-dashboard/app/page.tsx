import Link from 'next/link';
import { FileProblem, Progress, SpecStatusBadge, STAGE_LABEL, StatusBadge, STATUS_LABEL } from '@/components/Badges';
import { Markdown } from '@/components/Markdown';
import { loadFeatures, loadMemory, loadRoadmap } from '@/lib/repo';
import { ROADMAP_STATUSES, type Feature, type RoadmapStatus } from '@/lib/schema';

export const dynamic = 'force-dynamic';

const done = (items: { done: boolean }[]): number => items.filter((item) => item.done).length;

/** Stage and progress for a feature with a valid feature.json. */
function FeatureProgress({ feature }: { feature: Feature }): React.JSX.Element {
  return (
    <span className="feature-progress">
      <span className={`stage stage-${feature.stage}`}>{STAGE_LABEL[feature.stage]}</span>
      <Progress label="ACs" done={done(feature.acceptanceCriteria)} total={feature.acceptanceCriteria.length} />
      <Progress label="Tasks" done={done(feature.tasks)} total={feature.tasks.length} />
    </span>
  );
}

/** `/` — counts, the current state, and every roadmap phase with feature progress, from the JSON tracking files. */
export default async function OverviewPage(): Promise<React.JSX.Element> {
  const [roadmapResult, featureResults, memory] = await Promise.all([loadRoadmap(), loadFeatures(), loadMemory()]);
  const features = new Map(featureResults.map((entry) => [entry.folder, entry.feature]));
  const problems = [
    ...(roadmapResult.ok ? [] : [roadmapResult]),
    ...featureResults.flatMap((entry) => (entry.feature.ok ? [] : [entry.feature])),
  ];

  const roadmap = roadmapResult.ok ? roadmapResult.data : null;
  const counts = Object.fromEntries(ROADMAP_STATUSES.map((status) => [status, 0])) as Record<RoadmapStatus, number>;
  roadmap?.phases.forEach((phase) => phase.features.forEach((feature) => (counts[feature.status] += 1)));
  const openQuestions = featureResults.reduce(
    (sum, entry) => sum + (entry.feature.ok ? entry.feature.data.openQuestions.filter((question) => !question.resolved).length : 0),
    0,
  );
  const onRoadmap = new Set(roadmap?.phases.flatMap((phase) => phase.features.map((feature) => feature.folder)) ?? []);
  const unlisted = featureResults.filter((entry) => !onRoadmap.has(entry.folder));

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Spec-driven workflow</p>
        <h1>{roadmap?.project ?? 'Roadmap'}</h1>
        {roadmap && <p className="muted">Roadmap updated {roadmap.updated}</p>}
      </section>

      {problems.length > 0 && (
        <section className="card attention" aria-label="Tracking file problems">
          <h2>Tracking files need attention ({problems.length})</h2>
          {problems.map((problem) => (
            <FileProblem key={problem.file} file={problem.file} error={problem.error} />
          ))}
        </section>
      )}

      <section className="stats" aria-label="Features by status">
        {ROADMAP_STATUSES.map((status) => (
          <div key={status} className={`stat status-${status}`}>
            <strong>{counts[status]}</strong>
            <span>{STATUS_LABEL[status]}</span>
          </div>
        ))}
        <div className={`stat ${openQuestions > 0 ? 'attention' : ''}`}>
          <strong>{openQuestions}</strong>
          <span>Open questions</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{memory.currentState.title}</h2>
          <Link href="/memory">All memory →</Link>
        </div>
        {memory.currentState.body ? <Markdown>{memory.currentState.body}</Markdown> : <p className="muted">No current state recorded.</p>}
      </section>

      {roadmap?.phases.map((phase) => (
        <section key={phase.number} className="card phase">
          <h2>
            Phase {phase.number} — {phase.title}
          </h2>
          {phase.goal && <p className="phase-goal"><span>Goal</span> {phase.goal}</p>}
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Feature</th>
                <th scope="col">Status</th>
                <th scope="col">Progress</th>
              </tr>
            </thead>
            <tbody>
              {phase.features.map((row) => {
                const feature = row.folder ? features.get(row.folder) : undefined;
                return (
                  <tr key={row.id}>
                    <td className="mono">{row.id}</td>
                    <td>{row.folder ? <Link href={`/features/${row.folder}`}>{row.name}</Link> : row.name}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>
                      {!row.folder && <span className="muted">no spec yet</span>}
                      {feature?.ok && <FeatureProgress feature={feature.data} />}
                      {feature && !feature.ok && <span className="problem-inline">feature.json problem</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {phase.exitCriteria && <p className="phase-exit"><span>Exit criteria</span> {phase.exitCriteria}</p>}
        </section>
      ))}

      {unlisted.length > 0 && (
        <section className="card">
          <h2>Feature folders not on the roadmap</h2>
          <ul className="plain-list">
            {unlisted.map(({ folder, feature }) => (
              <li key={folder}>
                <Link href={`/features/${folder}`}>{folder}</Link>
                {feature.ok && <SpecStatusBadge status={feature.data.status} />}
                {feature.ok && <FeatureProgress feature={feature.data} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {roadmap && roadmap.backlog.length > 0 && (
        <section className="card">
          <h2>Backlog</h2>
          <ul className="plain-list bullets">
            {roadmap.backlog.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

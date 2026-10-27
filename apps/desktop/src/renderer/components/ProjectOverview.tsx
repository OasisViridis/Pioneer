import type { ProjectSummary } from '../../shared/contracts/catalog';

export interface ProjectOverviewProps {
  project: ProjectSummary;
}

export function ProjectOverview({
  project,
}: ProjectOverviewProps): React.JSX.Element {
  return (
    <article className="project-overview">
      <header>
        <p className="eyebrow">Project overview</p>
        <h1>{project.name}</h1>
        <p>{project.description ?? 'No description was discovered.'}</p>
      </header>
      <dl className="metadata-list">
        <div>
          <dt>Canonical path</dt>
          <dd className="path-text">{project.absolutePath}</dd>
        </div>
        <div>
          <dt>Technologies</dt>
          <dd>
            {project.technologies.length > 0
              ? project.technologies.join(', ')
              : 'None discovered'}
          </dd>
        </div>
        <div>
          <dt>Git</dt>
          <dd>
            {project.hasGitRepository ? 'Repository detected' : 'Not detected'}
          </dd>
        </div>
        <div>
          <dt>Last modified</dt>
          <dd>{new Date(project.lastModifiedAt).toLocaleString()}</dd>
        </div>
      </dl>
    </article>
  );
}

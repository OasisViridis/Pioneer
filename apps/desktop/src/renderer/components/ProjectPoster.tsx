import { useId, type CSSProperties } from 'react';

import type { ProjectSummary } from '../../shared/contracts/catalog';

export interface ProjectPosterProps {
  project: ProjectSummary;
  onOpen: (project: ProjectSummary) => void;
  unavailableReason?: string;
}

function seedNumber(seed: string): number {
  let value = 0;
  for (const character of seed)
    value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value;
}

const relativeRecency = (lastModifiedAt: string): string => {
  const elapsedDays = Math.round(
    (new Date(lastModifiedAt).getTime() - Date.now()) / 86_400_000,
  );
  if (!Number.isFinite(elapsedDays)) return 'Update time unavailable';
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(elapsedDays) < 30)
    return `Updated ${formatter.format(elapsedDays, 'day')}`;
  const elapsedMonths = Math.round(elapsedDays / 30);
  if (Math.abs(elapsedMonths) < 12)
    return `Updated ${formatter.format(elapsedMonths, 'month')}`;
  return `Updated ${formatter.format(Math.round(elapsedMonths / 12), 'year')}`;
};

export function ProjectPoster({
  project,
  onOpen,
  unavailableReason,
}: ProjectPosterProps): React.JSX.Element {
  const reasonId = useId();
  const unavailable = unavailableReason !== undefined;
  const seed = seedNumber(project.coverSeed);
  const coverStyle = {
    '--cover-hue-a': String(seed % 360),
    '--cover-hue-b': String((seed * 7 + 83) % 360),
  } as CSSProperties;

  return (
    <article className="project-poster">
      <button
        aria-label={`Open project ${project.name}`}
        aria-describedby={unavailable ? reasonId : undefined}
        className="project-poster__button"
        disabled={unavailable}
        onClick={() => {
          if (!unavailable) onOpen(project);
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className="project-poster__cover"
          style={coverStyle}
        />
        <span className="project-poster__body">
          <strong className="project-poster__name">{project.name}</strong>
          <span className="project-poster__description">
            {project.description ?? 'No description available.'}
          </span>
          <span className="project-poster__technologies">
            {project.technologies.length > 0
              ? project.technologies.join(', ')
              : 'No technologies discovered'}
          </span>
          <span className="project-poster__facts">
            <span>
              {project.hasGitRepository
                ? 'Git repository'
                : 'No Git repository'}
            </span>
            <span>{relativeRecency(project.lastModifiedAt)}</span>
          </span>
        </span>
      </button>
      {unavailable ? (
        <p className="project-poster__unavailable" id={reasonId}>
          {unavailableReason.trim() || 'Project is unavailable.'}
        </p>
      ) : null}
    </article>
  );
}

import { useMemo, useState } from 'react';

import type {
  CatalogResult,
  ProjectSummary,
} from '../../shared/contracts/catalog';
import type { CatalogStatus } from '../hooks/use-catalog';
import { CatalogNotice } from './CatalogNotice';
import { ProjectPoster } from './ProjectPoster';

export interface ProjectLibraryProps {
  status: CatalogStatus;
  result: CatalogResult | null;
  stale: boolean;
  error: string | null;
  busy: boolean;
  operation: 'loading' | 'choosing' | 'rescanning' | null;
  chooseRoot: () => Promise<void>;
  rescan: () => Promise<void>;
  onOpenProject: (project: ProjectSummary) => void;
}

export function ProjectLibrary({
  status,
  result,
  stale,
  error,
  busy,
  operation,
  chooseRoot,
  rescan,
  onOpenProject,
}: ProjectLibraryProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const projects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...(result?.projects ?? [])]
      .sort(
        (left, right) =>
          right.lastModifiedAt.localeCompare(left.lastModifiedAt) ||
          left.name.localeCompare(right.name),
      )
      .filter((project) =>
        project.name.toLocaleLowerCase().includes(normalizedQuery),
      );
  }, [query, result]);

  if (status === 'loading' && result === null)
    return <p role="status">The catalog is loading.</p>;

  if (result?.rootPath == null) {
    return (
      <section aria-busy={busy} className="empty-state">
        <h1>Project library</h1>
        <p>
          {error ??
            'Choose a workspace folder to discover its immediate project directories.'}
        </p>
        <button
          className="button button--primary"
          disabled={busy}
          onClick={() => void chooseRoot()}
          type="button"
        >
          Choose workspace
        </button>
        {busy ? (
          <p aria-live="polite" role="status">
            Loading project library…
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-busy={busy}
      aria-labelledby="library-title"
      className="library"
    >
      <header className="library__header">
        <div>
          <h1 id="library-title">Project library</h1>
          <p className="path-text">{result.rootPath}</p>
        </div>
        <div className="library__actions">
          <button
            className="button"
            aria-label={
              busy && operation === 'rescanning' ? 'Rescanning' : undefined
            }
            disabled={busy}
            onClick={() => void rescan()}
            type="button"
          >
            Rescan
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() => void chooseRoot()}
            type="button"
          >
            Change workspace
          </button>
        </div>
      </header>

      {busy ? (
        <p aria-live="polite" role="status">
          {operation === 'choosing'
            ? 'Changing workspace…'
            : operation === 'rescanning'
              ? 'Refreshing project library…'
              : 'Loading project library…'}
        </p>
      ) : null}

      <CatalogNotice error={error} stale={stale} warnings={result.warnings} />

      <label className="search-field">
        <span>Search projects</span>
        <input
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
          type="search"
          value={query}
        />
      </label>

      {projects.length > 0 ? (
        <div className="poster-grid">
          {projects.map((project) => (
            <ProjectPoster
              key={project.id}
              onOpen={onOpenProject}
              project={project}
              unavailableReason={
                stale ? '目录状态已过期，请重新扫描后打开。' : undefined
              }
            />
          ))}
        </div>
      ) : (
        <p>
          {result.projects.length === 0
            ? 'No project directories were found.'
            : 'No projects match this search.'}
        </p>
      )}
    </section>
  );
}

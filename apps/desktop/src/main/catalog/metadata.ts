import { join } from 'node:path';
import type {
  CatalogWarning,
  ProjectSummary,
} from '../../shared/contracts/catalog';
import type { CatalogFs } from './fs-adapter';
import { isPathInsideRoot, normalizeRootPath } from './path-policy';

const READ_PREFIX_BYTES = 65_536;
const PACKAGE_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export class MetadataInvalidError extends Error {
  public constructor(projectPath: string) {
    super(`Project metadata is invalid: ${projectPath}`);
    this.name = 'MetadataInvalidError';
  }
}

export class MetadataOutsideRootError extends Error {
  public constructor(
    public readonly entryPath: string,
    public readonly resolvedPath: string,
  ) {
    super(`Project metadata resolves outside the selected root: ${entryPath}`);
    this.name = 'MetadataOutsideRootError';
  }
}

export class MetadataNonRegularError extends Error {
  public constructor(public readonly entryPath: string) {
    super(`Project metadata is not a regular file: ${entryPath}`);
    this.name = 'MetadataNonRegularError';
  }
}

async function readOptionalPrefix(
  path: string,
  fs: CatalogFs,
  selectedRoot: string,
): Promise<string | null> {
  let resolvedPath: string;
  try {
    resolvedPath = normalizeRootPath(await fs.realpath(path));
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return null;
    throw error;
  }
  if (!isPathInsideRoot(selectedRoot, resolvedPath))
    throw new MetadataOutsideRootError(path, resolvedPath);
  let metadataStat: Awaited<ReturnType<CatalogFs['stat']>>;
  try {
    metadataStat = await fs.stat(resolvedPath);
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return null;
    throw error;
  }
  if (!metadataStat.isFile()) throw new MetadataNonRegularError(path);
  return fs.readTextPrefix(resolvedPath, READ_PREFIX_BYTES);
}

async function resolveGitEntry(
  path: string,
  fs: CatalogFs,
  selectedRoot: string,
): Promise<boolean> {
  let resolvedPath: string;
  try {
    resolvedPath = normalizeRootPath(await fs.realpath(path));
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return false;
    throw error;
  }
  if (!isPathInsideRoot(selectedRoot, resolvedPath))
    throw new MetadataOutsideRootError(path, resolvedPath);
  try {
    await fs.access(resolvedPath);
    return true;
  } catch {
    return false;
  }
}

function plainSummary(paragraph: string): string {
  return paragraph
    .replace(/(^|\s)>+\s*/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstReadmeParagraph(readme: string): string | null {
  const lines = readme
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\r?\n/);
  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const value = current.join(' ').trim();
    if (value) paragraphs.push(value);
    current = [];
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flush();
    } else {
      current.push(line.trim());
    }
  }
  flush();
  const plain = (paragraph: string): string => {
    const cleaned = plainSummary(paragraph);
    return cleaned.length > 0 ? cleaned : paragraph;
  };
  const picked = paragraphs.find((paragraph) => {
    const head = paragraph.trimStart();
    return !head.startsWith('#') && !head.startsWith('<');
  });
  return picked ? plain(picked) : null;
}

function packageTechnologies(record: Record<string, unknown>): string[] {
  const technologies = new Set<string>();
  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    const dependencies = record[field];
    if (
      typeof dependencies !== 'object' ||
      dependencies === null ||
      Array.isArray(dependencies)
    )
      continue;
    for (const dependency of Object.keys(dependencies)) {
      technologies.add(dependency);
    }
  }
  return [...technologies].sort((left, right) => left.localeCompare(right));
}

function parsePackageMetadata(
  packageText: string,
  projectPath: string,
): { description: string | null; technologies: string[] } {
  try {
    const parsed: unknown = JSON.parse(packageText);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new Error('not an object');
    const record = parsed as Record<string, unknown>;
    return {
      description:
        typeof record.description === 'string' && record.description.trim()
          ? record.description.trim()
          : null,
      technologies: packageTechnologies(record),
    };
  } catch {
    throw new MetadataInvalidError(projectPath);
  }
}

export async function readProjectMetadata(
  projectPath: string,
  fs: CatalogFs,
  selectedRoot: string,
): Promise<
  Pick<
    ProjectSummary,
    'description' | 'technologies' | 'hasGitRepository' | 'lastModifiedAt'
  > & { warnings: CatalogWarning[] }
> {
  const warnings: CatalogWarning[] = [];
  let packageText: string | null = null;
  try {
    packageText = await readOptionalPrefix(
      join(projectPath, 'package.json'),
      fs,
      selectedRoot,
    );
  } catch (error: unknown) {
    if (error instanceof MetadataOutsideRootError) {
      warnings.push({
        code: 'OUTSIDE_ROOT_LINK',
        path: error.entryPath,
        message: 'Project metadata resolves outside the selected root.',
      });
    } else {
      throw error;
    }
  }
  const packageMetadata = packageText?.trim()
    ? parsePackageMetadata(packageText, projectPath)
    : null;
  let readmeText: string | null = null;
  try {
    readmeText = await readOptionalPrefix(
      join(projectPath, 'README.md'),
      fs,
      selectedRoot,
    );
  } catch (error: unknown) {
    if (error instanceof MetadataOutsideRootError) {
      warnings.push({
        code: 'OUTSIDE_ROOT_LINK',
        path: error.entryPath,
        message: 'Project metadata resolves outside the selected root.',
      });
    } else {
      throw error;
    }
  }
  const stat = await fs.stat(projectPath);

  let hasGitRepository = false;
  try {
    hasGitRepository = await resolveGitEntry(
      join(projectPath, '.git'),
      fs,
      selectedRoot,
    );
  } catch (error: unknown) {
    if (error instanceof MetadataOutsideRootError) {
      warnings.push({
        code: 'OUTSIDE_ROOT_LINK',
        path: error.entryPath,
        message: 'Project metadata resolves outside the selected root.',
      });
    } else {
      throw error;
    }
  }

  return {
    description:
      packageMetadata?.description ??
      (readmeText ? firstReadmeParagraph(readmeText) : null),
    technologies: packageMetadata?.technologies ?? [],
    hasGitRepository,
    lastModifiedAt: stat.mtime.toISOString(),
    warnings,
  };
}

export { READ_PREFIX_BYTES };

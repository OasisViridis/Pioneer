import type { CatalogWarning } from '../../shared/contracts/catalog';
import { CatalogNotice } from './CatalogNotice';
import { PermissionCard, type PermissionCardState } from './PermissionCard';

const permissionPreviewStates: PermissionCardState[] = [
  'Awaiting',
  'Denied',
  'Expired',
  'Approved',
];

export interface SettingsViewProps {
  rootPath: string | null;
  chooseRoot: () => Promise<void>;
  error: string | null;
  stale: boolean;
  warnings: CatalogWarning[];
  busy: boolean;
}

const applicationVersion = '0.1.0';
const buildMode =
  process.env.NODE_ENV === 'production' ? 'Production' : 'Development';

export function SettingsView({
  rootPath,
  chooseRoot,
  error,
  stale,
  warnings,
  busy,
}: SettingsViewProps): React.JSX.Element {
  return (
    <section
      aria-busy={busy}
      aria-labelledby="settings-title"
      className="settings-view"
    >
      <h1 id="settings-title">Settings</h1>
      <CatalogNotice error={error} stale={stale} warnings={warnings} />
      <dl className="metadata-list">
        <div>
          <dt>Current workspace</dt>
          <dd className="path-text">{rootPath ?? 'No workspace selected'}</dd>
        </div>
        <div>
          <dt>Application version</dt>
          <dd>{applicationVersion}</dd>
        </div>
        <div>
          <dt>Build mode</dt>
          <dd>{buildMode}</dd>
        </div>
      </dl>
      <button
        className="button button--primary"
        disabled={busy}
        onClick={() => void chooseRoot()}
        type="button"
      >
        Change workspace
      </button>
      {busy ? (
        <p aria-live="polite" role="status">
          Changing workspace…
        </p>
      ) : null}
      <section
        aria-labelledby="settings-permission-title"
        className="settings-permission-preview"
      >
        <h2 id="settings-permission-title">Permission Card · design preview</h2>
        <p>
          Read-only visual review of the four reviewed states. These controls do
          not grant, record or infer a permission.
        </p>
        <div className="settings-permission-preview__grid">
          {permissionPreviewStates.map((state) => (
            <PermissionCard
              key={state}
              disabled
              expiry="时效：仅此一次；目标变更或超时即失效"
              note="设计示例 · 尚未接入 · 不具授权效力"
              operation="对象：毕业项目的设计文档"
              recipient="接收方：本地示例运行器；不外发"
              scope={
                '路径：D:/Project/Pioneer/docs\n权限：只读；不写入、不执行命令'
              }
              state={state}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

import { useState } from 'react';
import type { ProjectSummary } from '../shared/contracts/catalog';
import { querySessionActivity } from '../shared/session-activity';
import { ProjectLibrary } from './components/ProjectLibrary';
import { SettingsView } from './components/SettingsView';
import { SessionTabStrip } from './components/SessionTabStrip';
import { SessionList } from './components/SessionList';
import { SessionWorkbench } from './components/SessionWorkbench';
import { Modal } from './components/Modal';
import { useCatalog } from './hooks/use-catalog';
import { useSessionState } from './hooks/use-session-state';

export const App = (): React.JSX.Element => {
  const catalog = useCatalog();
  const sessions = useSessionState(window.pioneer);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(
    null,
  );
  const { state, dispatch } = sessions;
  const active = state.sessions.find(
    (session) => session.id === state.activeTabId,
  );
  const activity = querySessionActivity(state);
  const orderedSessions = activity.sessions.flatMap(({ id }) => {
    const session = state.sessions.find((item) => item.id === id);
    return session ? [session] : [];
  });
  const saveCopy =
    sessions.saveStatus.status === 'error'
      ? '尚未保存到本机'
      : sessions.saveStatus.status === 'saving'
        ? '正在保存到本机…'
        : sessions.reloadHeld
          ? '已保存到本机，请再次刷新。'
          : '已保存到本机';
  return (
    <main aria-label="Pioneer workspace" className="app-shell session-shell">
      <div className="app-content" inert={sessions.closePhase !== null}>
        {sessions.phase === 'ready' ? (
          <>
            <SessionTabStrip state={state} dispatch={dispatch} />
            {state.activeTabId === 'library' ? (
              <section
                aria-labelledby="tab-library"
                className="workspace-panel"
                id="panel-library"
                role="tabpanel"
              >
                <ProjectLibrary
                  {...catalog}
                  onOpenProject={setSelectedProject}
                />
                <section className="library-sessions" aria-label="本机会话">
                  <h2>最近会话</h2>
                  <SessionList
                    sessions={orderedSessions}
                    openIds={state.openSessionIds}
                    onOpen={(id) => {
                      dispatch({ type: 'OPEN_SESSION', id });
                    }}
                  />
                </section>
              </section>
            ) : state.activeTabId === 'settings' ? (
              <section
                aria-labelledby="tab-settings"
                className="workspace-panel"
                id="panel-settings"
                role="tabpanel"
              >
                <SettingsView
                  chooseRoot={catalog.chooseRoot}
                  busy={catalog.busy}
                  error={catalog.error}
                  rootPath={catalog.result?.rootPath ?? null}
                  stale={catalog.stale}
                  warnings={catalog.result?.warnings ?? []}
                />
              </section>
            ) : active ? (
              <section
                aria-labelledby={`tab-${active.id}`}
                className="workspace-panel session-host"
                id={`panel-${active.id}`}
                role="tabpanel"
              >
                <SessionWorkbench
                  key={active.id}
                  session={active}
                  dispatch={dispatch}
                  saveStatus={sessions.saveStatus}
                />
              </section>
            ) : null}
            <footer className="persistence-footer">
              <span className="save-status" role="status">
                {saveCopy}
              </span>
              {sessions.saveStatus.status === 'error' ? (
                <>
                  <p role="alert">保存失败。当前内容仍留在窗口里，请重试。</p>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={sessions.retry}
                  >
                    重试保存
                  </button>
                </>
              ) : null}
            </footer>
          </>
        ) : sessions.phase === 'loading' ? (
          <p className="empty-state" role="status">
            正在读取本机会话…
          </p>
        ) : (
          <section className="empty-state recovery-state">
            <h1>无法读取会话记录</h1>
            <p>原始记录已保留，没有创建空记录覆盖它。</p>
            <p className="path-text">pioneer-session-state.json</p>
            <p>{sessions.loadError}</p>
            <button className="button" type="button" onClick={sessions.retry}>
              重试读取
            </button>
          </section>
        )}
      </div>
      {selectedProject && sessions.phase === 'ready' ? (
        <Modal
          title={`工作区会话 · ${selectedProject.name}`}
          onClose={() => {
            setSelectedProject(null);
          }}
        >
          <p className="path-text">{selectedProject.absolutePath}</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              dispatch({
                type: 'CREATE_SESSION',
                id: `session:${crypto.randomUUID()}`,
                project: selectedProject,
              });
              setSelectedProject(null);
            }}
          >
            新建会话
          </button>
          <SessionList
            sessions={orderedSessions.filter(
              (session) => session.project.id === selectedProject.id,
            )}
            openIds={state.openSessionIds}
            onOpen={(id) => {
              dispatch({ type: 'OPEN_SESSION', id });
              setSelectedProject(null);
            }}
          />
        </Modal>
      ) : null}
      {sessions.closePhase !== null ? (
        <Modal
          title="关闭前保存会话"
          dismissible={false}
          onClose={sessions.cancelClose}
        >
          <p>
            {sessions.closePhase === 'saving'
              ? '正在保存最新会话，请稍候。'
              : '尚未确认保存，窗口尚未关闭。已开始的保存仍会完成。'}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              onClick={sessions.cancelClose}
            >
              继续使用
            </button>
            {sessions.closePhase === 'error' ? (
              <>
                <button
                  type="button"
                  className="button"
                  onClick={sessions.retryClose}
                >
                  重试保存并关闭
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={sessions.discardAndClose}
                >
                  不再重试并关闭
                </button>
              </>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </main>
  );
};

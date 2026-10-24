import { useEffect, useState } from 'react';
import type { WindowState, WindowDesktopApi } from '../../shared/window-state';
import { observeWindowState } from '../state/window-state-observer';
import { PanelMenu } from './PanelMenu';

/** Window operations only. No session/task/permission state is inferred here. */
export function WindowChrome({
  api,
}: {
  api: WindowDesktopApi;
}): React.JSX.Element {
  const [state, setState] = useState<WindowState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(
    () =>
      observeWindowState(
        api,
        (snapshot) => {
          setState(snapshot);
          setError(null);
        },
        () => {
          setError('暂时无法读取窗口状态，请重试。');
        },
      ),
    [api, retry],
  );
  const run = (operation: () => Promise<void>): void => {
    setError(null);
    void operation().catch(() => {
      setError('窗口操作未完成，请重试。');
    });
  };
  const fullscreenLabel = state?.fullscreen ? '退出全屏' : '进入全屏';
  const unavailableMaximize =
    !state || state.fullscreen || state.fullscreenTransitioning;
  const warning =
    state?.closeBlockedReason === 'tray-unavailable'
      ? '托盘不可用，已保留窗口。请用窗口菜单退出 Pioneer。'
      : error;
  return (
    <div className="window-chrome" data-focused={state?.focused ?? false}>
      <header className="window-titlebar" aria-label="Pioneer 窗口标题栏">
        <div
          className="window-traffic-lights"
          role="group"
          aria-label="窗口操作"
        >
          <button
            className="window-control window-control--close"
            type="button"
            aria-label="关闭窗口"
            title="关闭窗口，不退出应用"
            onClick={() => {
              run(() => api.closeWindow());
            }}
          >
            <span className="window-control-dot">
              <svg aria-hidden="true" viewBox="0 0 10 10">
                <path d="M2 2 8 8M8 2 2 8" />
              </svg>
            </span>
          </button>
          <button
            className="window-control window-control--minimize"
            type="button"
            aria-label="最小化窗口"
            title="最小化到任务栏"
            disabled={!state}
            onClick={() => {
              run(() => api.minimizeWindow());
            }}
          >
            <span className="window-control-dot">
              <svg aria-hidden="true" viewBox="0 0 10 10">
                <path d="M2 5H8" />
              </svg>
            </span>
          </button>
          <button
            className="window-control window-control--fullscreen"
            type="button"
            aria-label={fullscreenLabel}
            title={
              state?.fullscreenTransitioning
                ? '正在切换原生全屏'
                : fullscreenLabel
            }
            disabled={!state || state.fullscreenTransitioning}
            onClick={() => {
              run(() => api.toggleFullscreen());
            }}
          >
            <span className="window-control-dot">
              <svg aria-hidden="true" viewBox="0 0 10 10">
                <path
                  d={
                    state?.fullscreen ? 'M2 4H4V2M6 8V6H8' : 'M2 4V2H4M6 8H8V6'
                  }
                />
              </svg>
            </span>
          </button>
        </div>
        {/* Electron drag regions consume pointer events. Native caption dragging
            and double-click behavior are Windows manual gates, not fake DOM handlers. */}
        <div className="window-caption-drag" aria-hidden="true">
          Pioneer
        </div>
        <PanelMenu label="窗口菜单" className="window-menu">
          <button
            type="button"
            disabled={unavailableMaximize}
            title={
              state?.fullscreen ? '请先退出全屏，再最大化或还原' : undefined
            }
            onClick={() => {
              run(() => api.toggleMaximize());
            }}
          >
            {state?.maximized ? '还原窗口' : '最大化窗口'}
          </button>
          {state?.fullscreen ? (
            <p className="window-menu-note">请先退出全屏，再最大化或还原。</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              run(() => api.quitApp());
            }}
          >
            退出 Pioneer
          </button>
        </PanelMenu>
      </header>
      {warning ? (
        <div className="window-chrome-warning" role="alert">
          <span>{warning}</span>
          {error ? (
            <button
              type="button"
              onClick={() => {
                setRetry((value) => value + 1);
              }}
            >
              重试窗口状态
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

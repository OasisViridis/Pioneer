import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import type {
  DockColumn,
  DockPanelId,
  Session,
} from '../../shared/contracts/session-workspace';
import { fitDockPanels, visibleDockPanels } from '../../shared/docking';
import type { SessionWorkspaceAction } from '../state/session-workspace-reducer';
import { PanelMenu } from './PanelMenu';
import { Modal } from './Modal';
import { ResizeHandle } from './ResizeHandle';
import { panelNames } from './WorkbenchPanels';

const names: Record<DockPanelId, string> = {
  conversation: '会话',
  ...panelNames,
};
const dragType = 'application/x-pioneer-dock-panel';

export function DockSurface({
  session,
  dispatch,
  renderPanel,
}: {
  session: Session;
  dispatch: Dispatch<SessionWorkspaceAction>;
  renderPanel: (panel: DockPanelId) => ReactNode;
}): React.JSX.Element {
  const dock = session.dock;
  const root = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 1200, height: 600 });
  const [dragging, setDragging] = useState<DockPanelId | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [ratioPreview, setRatioPreview] = useState<number | null>(null);
  const [weightPreview, setWeightPreview] = useState<
    Partial<Record<DockPanelId, number>>
  >({});
  const [expanded, setExpanded] = useState<DockPanelId | null>(null);
  const [focusRequest, setFocusRequest] = useState<DockPanelId | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setBounds({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const all = visibleDockPanels(dock);
  const compact = bounds.width < 760;
  const primaryColumn: DockColumn = all.includes('conversation')
    ? dock.columns[0].includes('conversation')
      ? 0
      : 1
    : visibleDockPanels(dock, 0).length
      ? 0
      : 1;
  const columns = ([0, 1] as const).map((column) =>
    compact && column !== primaryColumn
      ? []
      : fitDockPanels(visibleDockPanels(dock, column), bounds.height - 36),
  );
  const temporarilyHidden = all.filter(
    (panel) => !columns.flat().includes(panel),
  );
  const twoColumns =
    Boolean(columns[0]?.length && columns[1]?.length) ||
    (!compact && dragging !== null);
  const minRatio = Math.max(25, (320 / Math.max(640, bounds.width - 12)) * 100);
  const maxRatio = Math.min(75, 100 - minRatio);
  const ratio = Math.min(
    maxRatio,
    Math.max(minRatio, ratioPreview ?? dock.ratio),
  );
  const weights = { ...dock.weights, ...weightPreview };
  useEffect(() => {
    if (focusRequest)
      root.current
        ?.querySelector<HTMLElement>(`[data-dock-handle="${focusRequest}"]`)
        ?.focus();
  }, [focusRequest, dock]);
  const move = (
    panel: DockPanelId,
    column: DockColumn,
    before?: DockPanelId,
  ): void => {
    dispatch({ type: 'DOCK_PANEL', id: session.id, panel, column, before });
    setFocusRequest(panel);
    setDragging(null);
    setDropTarget(null);
  };
  const drop = (
    event: React.DragEvent,
    column: DockColumn,
    before?: DockPanelId,
  ): void => {
    if (!dragging || event.dataTransfer.getData(dragType) !== dragging) return;
    event.preventDefault();
    event.stopPropagation();
    move(dragging, column, before);
  };
  return (
    <div
      className="workbench__body dock-surface"
      role="region"
      id="workbench-body"
      aria-label="会话面板工作区"
      ref={root}
    >
      {temporarilyHidden.length ? (
        <div className="dock-overflow">
          <span>
            为保留完整输入区，已临时收起 {temporarilyHidden.length} 个面板。
          </span>
          <PanelMenu label="临时收起的面板" summary="展开面板">
            {temporarilyHidden.map((panel) => (
              <button
                type="button"
                key={panel}
                onClick={() => {
                  setExpanded(panel);
                }}
              >
                {names[panel]}
              </button>
            ))}
          </PanelMenu>
        </div>
      ) : null}
      <div
        className="dock-columns"
        style={{
          gridTemplateColumns: twoColumns
            ? `minmax(0, ${String(ratio)}fr) 12px minmax(0, ${String(100 - ratio)}fr)`
            : 'minmax(0, 1fr)',
        }}
      >
        {([0, 1] as const).map((column) => {
          const panels = columns[column] ?? [];
          if (!panels.length && !twoColumns) return null;
          return (
            <Fragment key={column}>
              {column === 1 && twoColumns ? (
                <ResizeHandle
                  label="左右分栏宽度"
                  orientation="vertical"
                  min={minRatio}
                  max={maxRatio}
                  value={ratio}
                  extent={bounds.width - 12}
                  onPreview={setRatioPreview}
                  onCommit={(value) => {
                    dispatch({
                      type: 'SET_DOCK_RATIO',
                      id: session.id,
                      ratio: value,
                    });
                  }}
                />
              ) : null}
              <div
                className={`dock-column ${dropTarget === `column-${String(column)}` ? 'dock-column--target' : ''}`}
                data-dock-column={column}
                style={{
                  gridTemplateRows:
                    panels
                      .map(
                        (panel) =>
                          `minmax(${String(panel === 'conversation' ? 320 : 170)}px, ${String(weights[panel])}fr)`,
                      )
                      .join(' 8px ') || 'minmax(0, 1fr)',
                }}
                onDragOver={(event) => {
                  if (dragging) {
                    event.preventDefault();
                    setDropTarget(`column-${String(column)}`);
                  }
                }}
                onDrop={(event) => {
                  drop(event, column);
                }}
              >
                {!panels.length ? (
                  <div className="dock-empty-target">
                    停靠到{column === 0 ? '左' : '右'}侧
                  </div>
                ) : null}
                {panels.map((panel, index) => {
                  const previous = panels[index - 1];
                  const visibleInColumn = visibleDockPanels(dock, column);
                  const position = visibleInColumn.indexOf(panel);
                  const pairSum = previous
                    ? weights[previous] + weights[panel]
                    : 1;
                  return (
                    <Fragment key={panel}>
                      {previous ? (
                        <ResizeHandle
                          label={`${names[previous]}与${names[panel]}的高度`}
                          orientation="horizontal"
                          value={(weights[previous] / pairSum) * 100}
                          min={Math.max(
                            5,
                            (0.2 / pairSum) * 100,
                            (1 - 8 / pairSum) * 100,
                          )}
                          max={Math.min(
                            95,
                            (8 / pairSum) * 100,
                            (1 - 0.2 / pairSum) * 100,
                          )}
                          extent={(bounds.height / panels.length) * 2}
                          onPreview={(value) => {
                            setWeightPreview(
                              value === null
                                ? {}
                                : {
                                    [previous]: (pairSum * value) / 100,
                                    [panel]: (pairSum * (100 - value)) / 100,
                                  },
                            );
                          }}
                          onCommit={(value) => {
                            dispatch({
                              type: 'SET_DOCK_WEIGHTS',
                              id: session.id,
                              weights: {
                                [previous]: (pairSum * value) / 100,
                                [panel]: (pairSum * (100 - value)) / 100,
                              },
                            });
                          }}
                        />
                      ) : null}
                      <section
                        className={`dock-panel dock-panel--${panel} ${dropTarget === panel ? 'dock-panel--target' : ''}`}
                        aria-label={names[panel]}
                        data-panel-id={panel}
                        onDragOver={(event) => {
                          if (dragging) {
                            event.preventDefault();
                            event.stopPropagation();
                            setDropTarget(panel);
                          }
                        }}
                        onDrop={(event) => {
                          const before =
                            event.clientY <
                            event.currentTarget.getBoundingClientRect().top +
                              event.currentTarget.clientHeight / 2
                              ? panel
                              : visibleInColumn[position + 1];
                          drop(event, column, before);
                        }}
                      >
                        <header className="module-header">
                          <button
                            type="button"
                            className="panel-drag-handle"
                            data-dock-handle={panel}
                            draggable={!compact}
                            aria-label={`拖动${names[panel]}面板`}
                            title="拖动停靠；也可使用面板菜单"
                            onDragStart={(event) => {
                              event.dataTransfer.setData(dragType, panel);
                              event.dataTransfer.effectAllowed = 'move';
                              setDragging(panel);
                            }}
                            onDragEnd={() => {
                              setDragging(null);
                              setDropTarget(null);
                            }}
                          >
                            <span aria-hidden="true">⠿</span> {names[panel]}
                          </button>
                          <PanelMenu label={`${names[panel]}面板菜单`}>
                            <button
                              type="button"
                              disabled={column === 0}
                              onClick={() => {
                                move(panel, 0);
                              }}
                            >
                              移至左侧
                            </button>
                            <button
                              type="button"
                              disabled={column === 1}
                              onClick={() => {
                                move(panel, 1);
                              }}
                            >
                              移至右侧
                            </button>
                            <button
                              type="button"
                              disabled={position === 0}
                              onClick={() => {
                                dispatch({
                                  type: 'MOVE_PANEL',
                                  id: session.id,
                                  panel,
                                  direction: 'earlier',
                                });
                                setFocusRequest(panel);
                              }}
                            >
                              向前移动
                            </button>
                            <button
                              type="button"
                              disabled={position === visibleInColumn.length - 1}
                              onClick={() => {
                                dispatch({
                                  type: 'MOVE_PANEL',
                                  id: session.id,
                                  panel,
                                  direction: 'later',
                                });
                                setFocusRequest(panel);
                              }}
                            >
                              向后移动
                            </button>
                            <button
                              type="button"
                              disabled={all.length === 1}
                              onClick={() => {
                                dispatch({
                                  type: 'TOGGLE_PANEL',
                                  id: session.id,
                                  panel,
                                });
                                setFocusRequest(
                                  all.find((item) => item !== panel) ?? null,
                                );
                              }}
                            >
                              收起面板
                            </button>
                          </PanelMenu>
                        </header>
                        {renderPanel(panel)}
                      </section>
                    </Fragment>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
      </div>
      {expanded ? (
        <Modal
          title={`${names[expanded]} · 临时展开`}
          onClose={() => {
            setExpanded(null);
          }}
        >
          <div className="dock-expanded-content">{renderPanel(expanded)}</div>
        </Modal>
      ) : null}
    </div>
  );
}

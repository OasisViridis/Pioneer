import { useState } from 'react';
import type {
  Session,
  SessionId,
} from '../../shared/contracts/session-workspace';
import { workspaceIdentity } from './workspace-identity';

export function SessionList({
  sessions,
  openIds,
  onOpen,
}: {
  sessions: Session[];
  openIds: SessionId[];
  onOpen: (id: SessionId) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const filtered = sessions.filter((session) =>
    `${session.title} ${session.project.name}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="session-list">
      <label className="search-field">
        <span>搜索会话</span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </label>
      <p className="metadata">
        会话、草稿和布局保存在本机，关闭标签不会删除记录。
      </p>
      {filtered.length === 0 ? (
        <p className="quiet-empty">
          {query
            ? '没有匹配的会话。试试任务名称或工作区名。'
            : '还没有会话。从一个具体任务开始。'}
        </p>
      ) : (
        <ul>
          {filtered.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                aria-label={`打开会话 ${session.title}`}
                onClick={() => {
                  onOpen(session.id);
                }}
              >
                <span
                  className="workspace-mark"
                  style={workspaceIdentity(session.project.coverSeed)}
                  aria-hidden="true"
                >
                  {session.project.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="session-list__name">
                  <strong>{session.title}</strong>
                  <span>
                    {session.project.name} ·{' '}
                    {session.draft
                      ? '有未发送草稿'
                      : openIds.includes(session.id)
                        ? '已打开'
                        : '已保留'}
                  </span>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

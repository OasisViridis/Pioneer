import type { SessionActivitySnapshot } from '../session-activity';
import type { SessionWorkspaceState } from './session-workspace';

export const SESSION_IPC_CHANNELS = {
  load: 'session-state:load',
  save: 'session-state:save',
  activity: 'session-state:activity',
  closeResult: 'session-state:close-result',
} as const;
export const SESSION_CLOSE_REQUESTED_CHANNEL = 'session-state:close-requested';
export type CloseDecision = 'saved' | 'cancel' | 'discard' | 'failed';
/** Fixed local session port. It grants no model, tool, or workspace write capability. */
export interface SessionDesktopApi {
  loadSessionState(): Promise<SessionWorkspaceState | null>;
  saveSessionState(state: SessionWorkspaceState): Promise<void>;
  getSessionActivity(): Promise<SessionActivitySnapshot>;
  onCloseRequested(callback: () => void): () => void;
  finishClose(decision: CloseDecision): Promise<void>;
}

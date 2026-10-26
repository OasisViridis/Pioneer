import type {
  TaskIntent,
  TaskIntentStep,
} from '../../shared/contracts/task-intent';
import { bootstrapRuntimeSession } from '../../shared/runtime-session';
import {
  createRuntimeLifecycle,
  requestRuntimeStart,
} from '../../shared/runtime-lifecycle';
import { transitionIntent } from '../../shared/task-intent';
import {
  initialIntentWorkspaceState,
  type IntentWorkspaceState,
  type IntentWorkspaceError,
} from '../../shared/contracts/intent-workspace';
export { initialIntentWorkspaceState } from '../../shared/contracts/intent-workspace';
export type {
  IntentWorkspaceState,
  IntentWorkspacePhase,
  IntentWorkspaceError,
} from '../../shared/contracts/intent-workspace';
export type IntentWorkspaceAction =
  | { type: 'SET_INSTRUCTION'; instruction: string }
  | { type: 'SUBMIT'; projectId: string; ownerId?: string }
  | { type: 'EDIT' }
  | { type: 'CONFIRM' }
  | { type: 'BOOTSTRAP_SESSION' }
  | { type: 'REQUEST_RUNTIME_START' }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

export const buildPreviewSteps = (): TaskIntentStep[] => [
  { id: 'scope', summary: '确认目标、项目上下文与本轮边界' },
  { id: 'plan', summary: '形成最小安全修改计划与执行顺序' },
  { id: 'verify', summary: '确认验证方式、停止条件与交付结果' },
];

const newDraftIntent = (
  projectId: string,
  instruction: string,
  ownerId = projectId,
): TaskIntent => ({
  id: `intent:${ownerId}`,
  projectId,
  revision: 1,
  instruction,
  steps: buildPreviewSteps(),
  status: 'draft',
});

function failure(
  state: IntentWorkspaceState,
  error: IntentWorkspaceError,
): IntentWorkspaceState {
  return { ...state, error };
}

export function intentWorkspaceReducer(
  state: IntentWorkspaceState,
  action: IntentWorkspaceAction,
): IntentWorkspaceState {
  switch (action.type) {
    case 'SET_INSTRUCTION':
      return {
        ...state,
        draftInstruction: action.instruction,
        error: null,
      };

    case 'SUBMIT': {
      const instruction = state.draftInstruction.trim();
      if (instruction.length === 0) return failure(state, 'EMPTY_INSTRUCTION');

      let draft: TaskIntent;
      if (state.intent?.projectId !== action.projectId) {
        draft = newDraftIntent(action.projectId, instruction, action.ownerId);
      } else if (
        state.intent.status === 'cancelled' ||
        state.intent.status === 'ready'
      ) {
        draft = newDraftIntent(action.projectId, instruction, action.ownerId);
      } else if (state.intent.status === 'reviewing') {
        const revised = transitionIntent(state.intent, {
          type: 'revise',
          expectedRevision: state.intent.revision,
          instruction,
          steps: buildPreviewSteps(),
        });
        if (!revised.ok) return failure(state, revised.error);
        draft = revised.value;
      } else {
        draft = {
          ...state.intent,
          instruction,
          steps: buildPreviewSteps(),
        };
      }

      const submitted = transitionIntent(draft, {
        type: 'submit',
        expectedRevision: draft.revision,
      });
      if (!submitted.ok) return failure(state, submitted.error);

      return {
        phase: 'review',
        draftInstruction: instruction,
        intent: submitted.value,
        runtime: null,
        error: null,
      };
    }

    case 'EDIT':
      if (state.intent?.status !== 'reviewing') {
        return failure(state, 'INVALID_TRANSITION');
      }
      return { ...state, phase: 'compose', runtime: null, error: null };

    case 'CONFIRM': {
      if (state.intent === null) return failure(state, 'INVALID_INTENT');
      const confirmed = transitionIntent(state.intent, {
        type: 'confirm',
        expectedRevision: state.intent.revision,
      });
      if (!confirmed.ok) return failure(state, confirmed.error);
      return {
        ...state,
        phase: 'ready',
        intent: confirmed.value,
        runtime: null,
        error: null,
      };
    }

    case 'BOOTSTRAP_SESSION': {
      if (state.intent === null) return failure(state, 'INVALID_INTENT');
      if (state.runtime !== null) return failure(state, 'INVALID_TRANSITION');
      const bootstrapped = bootstrapRuntimeSession(state.intent);
      if (!bootstrapped.ok) return failure(state, bootstrapped.error);
      const lifecycle = createRuntimeLifecycle(bootstrapped.value);
      if (!lifecycle.ok) return failure(state, lifecycle.error);

      return {
        ...state,
        phase: 'session',
        runtime: lifecycle.value,
        error: null,
      };
    }

    case 'REQUEST_RUNTIME_START': {
      if (state.runtime === null || state.phase !== 'session') {
        return failure(state, 'INVALID_LIFECYCLE');
      }
      const requested = requestRuntimeStart(state.runtime);
      if (!requested.ok) return failure(state, requested.error);

      return {
        ...state,
        runtime: requested.value,
        error: null,
      };
    }

    case 'CANCEL': {
      if (state.intent === null) return failure(state, 'INVALID_INTENT');
      const cancelled = transitionIntent(state.intent, {
        type: 'cancel',
        expectedRevision: state.intent.revision,
      });
      if (!cancelled.ok) return failure(state, cancelled.error);
      return {
        ...state,
        phase: 'cancelled',
        intent: cancelled.value,
        runtime: null,
        error: null,
      };
    }

    case 'RESET':
      return initialIntentWorkspaceState();
  }
}

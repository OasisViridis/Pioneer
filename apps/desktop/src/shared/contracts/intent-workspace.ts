import { z } from 'zod';
import {
  RuntimeLifecycleSchema,
  RuntimeLifecycleErrorCodeSchema,
  type RuntimeLifecycle,
  type RuntimeLifecycleErrorCode,
} from './runtime-lifecycle';
import {
  RuntimeSessionErrorCodeSchema,
  type RuntimeSessionErrorCode,
} from './runtime-session';
import {
  TaskIntentSchema,
  IntentErrorCodeSchema,
  type TaskIntent,
  type IntentErrorCode,
} from './task-intent';
export type IntentWorkspacePhase =
  'compose' | 'review' | 'ready' | 'session' | 'cancelled';

export type IntentWorkspaceError =
  | 'EMPTY_INSTRUCTION'
  | IntentErrorCode
  | RuntimeSessionErrorCode
  | RuntimeLifecycleErrorCode;

export interface IntentWorkspaceState {
  phase: IntentWorkspacePhase;
  draftInstruction: string;
  intent: TaskIntent | null;
  runtime: RuntimeLifecycle | null;
  error: IntentWorkspaceError | null;
}

export const initialIntentWorkspaceState = (): IntentWorkspaceState => ({
  phase: 'compose',
  draftInstruction: '',
  intent: null,
  runtime: null,
  error: null,
});

export const IntentWorkspaceStateSchema: z.ZodType<IntentWorkspaceState> = z
  .object({
    phase: z.enum(['compose', 'review', 'ready', 'session', 'cancelled']),
    draftInstruction: z.string().max(16_384),
    intent: TaskIntentSchema.nullable(),
    runtime: RuntimeLifecycleSchema.nullable(),
    error: z
      .union([
        z.literal('EMPTY_INSTRUCTION'),
        IntentErrorCodeSchema,
        RuntimeSessionErrorCodeSchema,
        RuntimeLifecycleErrorCodeSchema,
      ])
      .nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    const status = state.intent?.status;
    const valid =
      state.phase === 'compose'
        ? !status || status === 'draft' || status === 'reviewing'
        : state.phase === 'review'
          ? status === 'reviewing'
          : state.phase === 'cancelled'
            ? status === 'cancelled'
            : status === 'ready';
    if (!valid)
      context.addIssue({
        code: 'custom',
        path: ['phase'],
        message: 'Intent phase and status must agree.',
      });
    if (state.phase === 'session') {
      if (
        !state.runtime ||
        JSON.stringify(state.runtime.session.approvedIntent) !==
          JSON.stringify(state.intent)
      )
        context.addIssue({
          code: 'custom',
          path: ['runtime'],
          message: 'Runtime must reference the current approved revision.',
        });
    } else if (state.runtime !== null)
      context.addIssue({
        code: 'custom',
        path: ['runtime'],
        message: 'Only an initialized phase may retain a runtime snapshot.',
      });
  });

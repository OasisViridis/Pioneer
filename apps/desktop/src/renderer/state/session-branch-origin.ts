import type {
  BranchOrigin,
  Session,
} from '../../shared/contracts/session-workspace';

export type BranchOriginView =
  | { kind: 'available'; title: string; messageIndex: number }
  | { kind: 'unavailable' };

/** A saved origin is available only while the identified message still matches. */
export function resolveBranchOrigin(
  origin: BranchOrigin | null | undefined,
  source: Session | undefined,
): BranchOriginView | null {
  if (!origin) return null;
  if (
    source?.id !== origin.sessionId ||
    source.messages[origin.messageIndex] !== origin.messageText
  )
    return { kind: 'unavailable' };
  return {
    kind: 'available',
    title: source.title,
    messageIndex: origin.messageIndex,
  };
}

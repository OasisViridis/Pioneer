import jellyCompanion from '../assets/hazel/jelly-companion.png';
import listeningCompanion from '../assets/hazel/greendou-listening.png';
import readingCompanion from '../assets/hazel/greendou-reading.png';
import organizingCompanion from '../assets/hazel/greendou-organizing.png';
import butterfly from '../assets/hazel/paper-butterfly.png';
import bookmark from '../assets/hazel/cherry-bookmark.png';
import charm from '../assets/hazel/jelly-ribbon-charm.png';
import uniformRibbon from '../assets/hazel/uniform-ribbon.png';
import ribbonOutline from '../assets/hazel/ribbon-outline.svg';
import cherryPair from '../assets/hazel/cherry-pair.svg';
import paperFold from '../assets/hazel/silver-paper-fold.svg';
import jellyOutline from '../assets/hazel/jelly-outline.svg';
import type { SessionId } from '../../shared/contracts/session-workspace';

const companions = {
  quiet: jellyCompanion,
  listening: listeningCompanion,
  reading: readingCompanion,
  organizing: organizingCompanion,
  butterfly,
  bookmark,
  charm,
  uniformRibbon,
  ribbonOutline,
  cherryPair,
  paperFold,
  jellyOutline,
};

type Theme = keyof typeof companions;
const pool: readonly Theme[] = [
  'listening',
  'butterfly',
  'charm',
  'jellyOutline',
  'reading',
  'bookmark',
  'paperFold',
  'quiet',
  'uniformRibbon',
  'ribbonOutline',
  'cherryPair',
];
type Props =
  { pose?: Theme; sessionId?: never } | { sessionId: SessionId; pose?: never };

/** One static local empty-state theme; never execution, permission or activity. */
export function HazelCompanion(props: Props): React.JSX.Element {
  const theme =
    props.sessionId === undefined
      ? (props.pose ?? 'quiet')
      : (pool[
          props.sessionId.charCodeAt(props.sessionId.length - 1) % pool.length
        ] ?? 'quiet');
  const motif = !['quiet', 'listening', 'reading', 'organizing'].includes(
    theme,
  );
  const size = motif ? 48 : 88;
  return (
    <img
      className={`hazel-companion${motif ? ' hazel-companion--motif' : ''}`}
      src={companions[theme]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}

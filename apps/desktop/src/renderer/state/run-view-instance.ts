import type { RunPort } from './run-view';
import { RunViewStore } from './run-view';
import type { PioneerDesktopApi } from '../../shared/contracts/ipc';

const desktop = (): PioneerDesktopApi =>
  (window as Window & { pioneer: PioneerDesktopApi }).pioneer;

const port: RunPort = {
  authorizeRun: (request) => desktop().authorizeRun(request),
  listRunMaterials: (request) => desktop().listRunMaterials(request),
  startRun: (request) => desktop().startRun(request),
  stopRun: (request) => desktop().stopRun(request),
  getRun: (request) => desktop().getRun(request),
  getRunContext: (request) => desktop().getRunContext(request),
  subscribeRun: (request) => desktop().subscribeRun(request),
  acknowledgeRunPage: (request) => desktop().acknowledgeRunPage(request),
  onRunEventBatch: (callback) => desktop().onRunEventBatch(callback),
};

export const runViews = new RunViewStore(port);

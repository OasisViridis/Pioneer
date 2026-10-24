declare module '*.css';

interface Window {
  pioneer: import('../shared/contracts/ipc').PioneerDesktopApi;
}

declare module '*.png' {
  const url: string;
  export default url;
}
declare module '*.svg' {
  const url: string;
  export default url;
}

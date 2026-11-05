import { useState, useEffect } from 'react';

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.2.3';
export const GIT_COMMIT = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : '';
export const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';
export const VERSION_DISPLAY = `v${APP_VERSION}`;
export const VERSION_TOOLTIP = GIT_COMMIT
  ? `Versión v${APP_VERSION} · Commit ${GIT_COMMIT}${BUILD_DATE ? ` (${BUILD_DATE})` : ''}`
  : `Versión v${APP_VERSION}`;

export function useAppVersion() {
  const [display, setDisplay] = useState(VERSION_DISPLAY);
  const [tooltip, setTooltip] = useState(VERSION_TOOLTIP);

  useEffect(() => {
    fetch('/api/version', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d && d.version) {
          setDisplay(`v${d.version}`);
          setTooltip(
            d.commit
              ? `Versión v${d.version} · Commit ${d.commit}${d.date ? ` (${d.date})` : ''}`
              : `Versión v${d.version}`
          );
        }
      })
      .catch(() => {});
  }, []);

  return { display, tooltip };
}

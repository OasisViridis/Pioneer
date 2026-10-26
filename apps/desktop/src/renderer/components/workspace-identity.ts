import type { CSSProperties } from 'react';

/** Stable workspace identity, shared by its poster, session tabs and history. */
export function workspaceIdentity(seed: string): CSSProperties {
  let hash = 0;
  for (const character of seed)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const colors = [
    '#333c50',
    '#d3d3d3',
    '#dde2e9',
    '#d7e3da',
    '#ede4d6',
    '#ebdada',
  ];
  return {
    '--workspace-color': colors[hash % colors.length],
    '--workspace-ink': hash % colors.length === 0 ? '#f9faf7' : '#2c3547',
  } as CSSProperties;
}

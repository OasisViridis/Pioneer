import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/session-workbench.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Pioneer renderer root is missing.');
}

createRoot(rootElement).render(<App />);

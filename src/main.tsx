import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './shared/ui/ErrorBoundary';
import './styles/index.css';

const root = document.getElementById('root');

if (!root) throw new Error('Application root was not found');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

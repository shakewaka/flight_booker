import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('起動先の要素が見つかりません。');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

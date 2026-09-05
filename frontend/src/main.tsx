import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import './styles.css';
import { useReducedMotionPreference } from './lib/useReducedMotionPreference';
function Root() {
  const reduced = useReducedMotionPreference();
  return (
    // Apply the live motion preference to Motion components throughout the app.
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <App />
    </MotionConfig>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

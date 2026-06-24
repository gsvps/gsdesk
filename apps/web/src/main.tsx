import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { installAgentHttpBridge, isAgentLocalServer } from './lib/bridge-http';
import { migrateBrowserPrefsFromAgent } from './lib/browser-prefs';
import { initRuntimeConfig, isDesktopClient } from './lib/runtime-config';
import { notifyUIReady } from './lib/window-bridge';

async function bootstrap() {
  if (isAgentLocalServer()) {
    installAgentHttpBridge();
  }
  await initRuntimeConfig();
  if (isAgentLocalServer()) {
    await migrateBrowserPrefsFromAgent();
  }
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  if (isDesktopClient() || isAgentLocalServer()) {
    requestAnimationFrame(() => {
      void notifyUIReady();
    });
  }
}

void bootstrap();

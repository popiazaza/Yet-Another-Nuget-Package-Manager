import React, { useState, useEffect } from 'react';

interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState?(): unknown;
  setState?(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeAPI;
}

const App: React.FC = () => {
  const [initialized, setInitialized] = useState(false);
  const vscodeApi = acquireVsCodeApi();

  useEffect(() => {
    setInitialized(true);
  }, []);

  if (!initialized) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'var(--vscode-font-family)' }}>
      <h1>NuGet Package Manager</h1>
      <p>Welcome to Yet Another NuGet Package Manager!</p>
    </div>
  );
};

export default App;

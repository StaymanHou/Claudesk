import reactLogo from "./assets/react.svg";
import "./App.css";

// Scaffold landing page — replaced by the WorkspaceList / Center Stage /
// Filmstrip tab-shell in WP5. The demo `greet` Tauri command was removed in
// the 2026-06-17 refactor pass (the real command surface lands in WP7).
function App() {
  return (
    <main className="container">
      <h1>Claudesk</h1>

      <div className="row">
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank" rel="noreferrer">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Bare shell — the workspace UI arrives in WP5.</p>
    </main>
  );
}

export default App;

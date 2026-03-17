import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MiniTest from './pages/MiniTest';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <span className="brand-icon">⚡</span>
            <span className="brand-text">WebTestAgent</span>
          </div>
          <div className="sidebar-intro">
            <p>AI-Powered Web Testing</p>
            <p className="sidebar-intro-desc">Enter a URL, let AI generate and run tests automatically. Make testing as easy as breathing.</p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          <Routes>
            <Route path="/*" element={<MiniTest />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

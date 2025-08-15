import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import SchedulePage from "./pages/SchedulePage";
import MatchesPage from "./pages/MatchesPage";
import "./index.css";

export default function App() {
  const { pathname } = useLocation();

  return (
    <div className="app">
      <header className="app-header">
        <div className="container">
          <h1 className="app-title">🏸 羽球賽事管理</h1>
          <p className="app-subtitle">快速建立賽程・即時記錄比分</p>
          <nav className="tabs">
            <NavLink
              to="/schedule"
              className={({ isActive }) => `tab ${isActive ? "is-active" : ""}`}
            >
              產生賽程表
            </NavLink>
            <NavLink
              to="/matches"
              className={({ isActive }) => `tab ${isActive ? "is-active" : ""}`}
            >
              對戰 & 記分
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="container">
        <div className="card">
          <Routes>
            <Route path="/" element={<Navigate to="/matches" replace />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="*" element={<div>找不到頁面</div>} />
          </Routes>
        </div>
      </main>

      <footer className="container app-footer">
      </footer>
    </div>
  );
}

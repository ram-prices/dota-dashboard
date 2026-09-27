import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { MatchDetail } from "./pages/MatchDetail";
import { HeroStats } from "./pages/HeroStats";
import { Peers } from "./pages/Peers";
import { PlayerVs } from "./pages/PlayerVs";
import { ChatSearch } from "./pages/ChatSearch";
import { Settings } from "./pages/Settings";
import { getAccountId } from "./settings";

// Passes the tracked account (fixed per build - see settings.ts) down to
// pages that need it.
function RequireAccount({ children }: { children: (accountId: number) => React.ReactNode }) {
  return <>{children(getAccountId())}</>;
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-active" : undefined;
}

export function App() {
  const location = useLocation();

  return (
    <div className="app">
      <header className="app-header">
        <NavLink to="/" className="brand" end>
          Dota Stats
        </NavLink>
        <nav>
          <NavLink to="/" className={navClass} end>
            Matches
          </NavLink>
          <NavLink to="/heroes" className={navClass}>
            Heroes
          </NavLink>
          <NavLink to="/peers" className={navClass}>
            Teammates
          </NavLink>
          <NavLink to="/search" className={navClass}>
            Chat search
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            Settings
          </NavLink>
        </nav>
      </header>
      <main className="app-main">
        {/* Keyed on the path so every navigation remounts this wrapper,
            replaying the page-in entrance animation each time. */}
        <div className="page-transition" key={location.pathname}>
          <Routes>
            <Route
              path="/"
              element={<RequireAccount>{(accountId) => <Dashboard accountId={accountId} />}</RequireAccount>}
            />
            <Route
              path="/heroes"
              element={<RequireAccount>{(accountId) => <HeroStats accountId={accountId} />}</RequireAccount>}
            />
            <Route
              path="/peers"
              element={<RequireAccount>{(accountId) => <Peers accountId={accountId} />}</RequireAccount>}
            />
            <Route path="/search" element={<ChatSearch />} />
            <Route path="/matches/:matchId" element={<MatchDetail />} />
            <Route
              path="/vs/:targetAccountId"
              element={<RequireAccount>{(accountId) => <PlayerVs accountId={accountId} />}</RequireAccount>}
            />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

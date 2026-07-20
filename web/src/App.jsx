import { useState } from "react";
import HubSidebar from "./components/HubSidebar.jsx";
import HubHome from "./components/HubHome.jsx";
import WorkflowCreator from "./components/WorkflowCreator.jsx";

export default function App() {
  const [page, setPage] = useState("hub");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="layout">
      <HubSidebar
        activePage={page}
        onNavigate={setPage}
        refreshKey={refreshKey}
      />
      <main className="main">
        {page === "hub" ? (
          <HubHome />
        ) : (
          <WorkflowCreator onRunComplete={() => setRefreshKey((k) => k + 1)} />
        )}
      </main>
    </div>
  );
}

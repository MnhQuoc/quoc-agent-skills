import { useState } from "react";
import SkillsList from "./components/SkillsList";
import SkillSearch from "./components/SkillSearch";
import SkillForm from "./components/SkillForm";
import "./App.css";

const TABS = [
  { id: "list", label: "📚 List", Component: SkillsList },
  { id: "search", label: "🔍 Search", Component: SkillSearch },
  { id: "create", label: "➕ Create", Component: SkillForm },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("list");
  const Active = TABS.find((t) => t.id === activeTab).Component;

  return (
    <div className="container">
      <div className="header">
        <h1>🎯 Skill Manager</h1>
        <p>Quản lý skills/*/SKILL.md của quoc-agent-skills</p>
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Active />
    </div>
  );
}

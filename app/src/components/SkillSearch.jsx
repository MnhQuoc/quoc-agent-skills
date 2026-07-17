import { useEffect, useState } from "react";
import { searchSkills } from "../api";
import SkillCard from "./SkillCard";
import SkillDetail from "./SkillDetail";

export default function SkillSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSkill, setSelectedSkill] = useState(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchSkills(query)
        .then(setResults)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="card">
      <h2>🔍 Tìm Skill</h2>

      <div className="input-group">
        <input
          type="text"
          placeholder="Tìm theo tên hoặc slug..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      {loading && <div className="status-info">⏳ Đang tìm...</div>}
      {error && <div className="error">❌ Lỗi tìm kiếm: {error}</div>}

      {query && !loading && results && (
        <div className="search-results">
          <h3>Tìm thấy {results.length} skill</h3>
          {results.length === 0 ? (
            <div className="error">Không có skill phù hợp</div>
          ) : (
            <div className="skill-list">
              {results.map((skill) => (
                <SkillCard key={skill.slug} skill={skill} onClick={setSelectedSkill} />
              ))}
            </div>
          )}
        </div>
      )}

      <SkillDetail skill={selectedSkill} onClose={() => setSelectedSkill(null)} />
    </div>
  );
}

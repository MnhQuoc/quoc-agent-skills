import { useEffect, useState } from "react";
import { fetchSkills } from "../api";
import SkillCard from "./SkillCard";
import SkillDetail from "./SkillDetail";

export default function SkillsList() {
  const [skills, setSkills] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSkills()
      .then(setSkills)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reloadToken]);

  return (
    <div className="card">
      <h2>📚 Danh sách Skill</h2>
      <div className="controls">
        <button className="btn-primary" onClick={() => setReloadToken((t) => t + 1)}>
          🔄 Refresh
        </button>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Đang tải skill...
        </div>
      )}
      {error && <div className="error">❌ Lỗi: {error}</div>}

      {skills && skills.length === 0 && <p className="empty">Chưa có skill nào.</p>}

      {skills && skills.length > 0 && (
        <div className="skill-list">
          {skills.map((skill) => (
            <SkillCard key={skill.slug} skill={skill} onClick={setSelectedSkill} />
          ))}
        </div>
      )}

      <SkillDetail skill={selectedSkill} onClose={() => setSelectedSkill(null)} />
    </div>
  );
}

export default function SkillDetail({ skill, onClose }) {
  if (!skill) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Đóng">
          ✕
        </button>

        <h2 className="modal-title">{skill.name}</h2>
        <div className="skill-footer" style={{ marginBottom: 16 }}>
          <span className="slug-badge">{skill.slug}</span>
          {skill.internal && <span className="internal-badge">internal</span>}
        </div>

        <p className="modal-description">{skill.description}</p>

        <h3 className="modal-subtitle">📄 Nội dung SKILL.md</h3>
        {skill.content ? (
          <pre className="modal-code">{skill.content}</pre>
        ) : (
          <p className="empty">Chưa có nội dung — hãy chỉnh sửa trực tiếp file skills/{skill.slug}/SKILL.md.</p>
        )}
      </div>
    </div>
  );
}

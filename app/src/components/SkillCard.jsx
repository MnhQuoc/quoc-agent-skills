export default function SkillCard({ skill, onClick }) {
  return (
    <div
      className="skill-item skill-item-clickable"
      onClick={() => onClick?.(skill)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.(skill);
      }}
    >
      <h3>{skill.name}</h3>
      <p className="skill-desc">{skill.description}</p>
      <div className="skill-footer">
        <span className="slug-badge">{skill.slug}</span>
        {skill.internal && <span className="internal-badge">internal</span>}
      </div>
    </div>
  );
}

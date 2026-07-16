import { useState } from "react";
import { createSkill } from "../api";

export default function SkillForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setMessage({ type: "error", text: "Vui lòng nhập tên và mô tả." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const skill = await createSkill({ name, description, content });
      setMessage({ type: "success", text: `✅ Đã tạo skill "${skill.slug}"!` });
      setName("");
      setDescription("");
      setContent("");
    } catch (err) {
      setMessage({ type: "error", text: "❌ " + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>➕ Tạo Skill mới</h2>

      {message && <div className={message.type === "error" ? "error" : "success"}>{message.text}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="skill-name">Tên skill</label>
          <input
            id="skill-name"
            type="text"
            placeholder="VD: docker, testing, deploy..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="skill-desc">Mô tả (khi nào agent nên dùng skill này)</label>
          <input
            id="skill-desc"
            type="text"
            placeholder="Dùng khi user yêu cầu..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="skill-content">Nội dung hướng dẫn (Markdown, không bắt buộc)</label>
          <textarea
            id="skill-content"
            rows={6}
            placeholder="# Tên skill&#10;&#10;Nội dung hướng dẫn cho agent..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Đang tạo..." : "➕ Tạo Skill"}
        </button>
      </form>
    </div>
  );
}

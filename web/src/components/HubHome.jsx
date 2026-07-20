export default function HubHome() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Chào bro 👋</h1>
        <p>
          Hub theo dõi token khi chạy skill. Bên trái hiển thị tổng token hôm nay — mỗi lần
          chạy skill qua Cursor SDK sẽ được ghi vào MongoDB.
        </p>
      </header>

      <div className="cards">
        <article className="card">
          <h2>📊 Token tracking</h2>
          <p>
            Token được lấy từ <code>run.usage</code> của Cursor SDK sau mỗi lần chạy skill.
          </p>
        </article>

        <article className="card">
          <h2>🚀 Tạo Web</h2>
          <p>
            Tab <strong>Tạo Web</strong> chạy pipeline skill từ <code>quoc-agent-skills</code> để
            biến yêu cầu thành requirements, plan, rồi implement code.
          </p>
        </article>

        <article className="card">
          <h2>⚙️ Cần chuẩn bị</h2>
          <ul className="checklist">
            <li>MongoDB đang chạy</li>
            <li><code>CURSOR_API_KEY</code> trong file <code>.env</code></li>
            <li>API: <code>npm run api</code> (port 4322)</li>
          </ul>
        </article>
      </div>
    </div>
  );
}

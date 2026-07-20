const CUSTOM_OPTION = {
  letter: "D",
  text: "Khác (tự nhập)",
};

export default function OpenQuestionsForm({
  questions,
  answers,
  onChange,
  onApply,
  disabled,
}) {
  if (questions.length === 0) return null;

  const allAnswered = questions.every((q) => {
    const a = answers[q.id];
    if (!a?.choice) return false;
    if (a.choice === "D") return Boolean(a.customText?.trim());
    return true;
  });

  function selectOption(questionId, letter) {
    onChange({
      ...answers,
      [questionId]: {
        choice: letter,
        customText: answers[questionId]?.customText || "",
      },
    });
  }

  function setCustomText(questionId, customText) {
    onChange({
      ...answers,
      [questionId]: { choice: "D", customText },
    });
  }

  return (
    <div className="open-questions">
      <h3>Trả lời câu hỏi</h3>
      <p className="muted">Chọn A/B/C hoặc D để tự nhập, rồi áp dụng trước khi chạy bước tiếp theo.</p>

      {questions.map((q) => {
        const selected = answers[q.id]?.choice;
        const options = [...q.options, CUSTOM_OPTION];

        return (
          <div key={q.id} className="question-block">
            <p className="question-title">
              <strong>Câu {q.id}.</strong> {q.title}
            </p>

            <div className="option-grid">
              {options.map((opt) => (
                <button
                  key={opt.letter}
                  type="button"
                  className={`option-btn${selected === opt.letter ? " selected" : ""}`}
                  disabled={disabled}
                  onClick={() => selectOption(q.id, opt.letter)}
                >
                  <span className="option-letter">{opt.letter}</span>
                  <span className="option-text">{opt.text}</span>
                </button>
              ))}
            </div>

            {selected === "D" && (
              <input
                type="text"
                className="custom-answer-input"
                placeholder="Nhập câu trả lời của bạn..."
                value={answers[q.id]?.customText || ""}
                disabled={disabled}
                onChange={(e) => setCustomText(q.id, e.target.value)}
              />
            )}
          </div>
        );
      })}

      <div className="actions">
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || !allAnswered}
          onClick={onApply}
        >
          Áp dụng câu trả lời & chạy lại Requirement
        </button>
      </div>
    </div>
  );
}

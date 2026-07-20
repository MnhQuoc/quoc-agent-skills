import { useEffect, useMemo, useState } from "react";
import { fetchWorkflowSkills, runWorkflowStep } from "../api.js";
import OpenQuestionsForm from "./OpenQuestionsForm.jsx";
import {
  allQuestionsAnswered,
  buildEffectivePrompt,
  parseOpenQuestions,
} from "../lib/parseOpenQuestions.js";

function formatNumber(n) {
  return new Intl.NumberFormat("vi-VN").format(n || 0);
}

export default function WorkflowCreator({ onRunComplete }) {
  const [skills, setSkills] = useState([]);
  const [userPrompt, setUserPrompt] = useState("");
  const [cwd, setCwd] = useState("");
  const [steps, setSteps] = useState([]);
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [pipelinePaused, setPipelinePaused] = useState(false);

  const latestRequirementOutput = useMemo(() => {
    const requirementSteps = steps.filter((s) => s.skillSlug === "skill-requirement");
    return requirementSteps.length
      ? requirementSteps[requirementSteps.length - 1].output
      : "";
  }, [steps]);

  const openQuestions = useMemo(
    () => parseOpenQuestions(latestRequirementOutput),
    [latestRequirementOutput],
  );

  const effectivePrompt = useMemo(
    () => buildEffectivePrompt(userPrompt, openQuestions, questionAnswers),
    [userPrompt, openQuestions, questionAnswers],
  );

  const answersComplete = allQuestionsAnswered(openQuestions, questionAnswers);

  useEffect(() => {
    fetchWorkflowSkills()
      .then(setSkills)
      .catch((err) => setError(err.message));
  }, []);

  async function runStep(skillSlug, context, prompt = effectivePrompt) {
    const result = await runWorkflowStep({
      skillSlug,
      userPrompt: prompt,
      context,
      cwd: cwd.trim() || undefined,
    });

    setSteps((prev) => [
      ...prev,
      {
        skillSlug,
        status: result.status,
        output: result.output,
        usage: result.usage,
        runId: result.runId,
        durationMs: result.durationMs,
        reportPath: result.reportPath,
        reportStampedPath: result.reportStampedPath,
      },
    ]);

    onRunComplete?.();
    return result.output || "";
  }

  async function runSingle(skillSlug) {
    setRunning(true);
    setError("");
    setPipelinePaused(false);
    try {
      const lastOutput = steps.length ? steps[steps.length - 1].output : "";
      await runStep(skillSlug, lastOutput);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function applyAnswersAndRerunRequirement() {
    setRunning(true);
    setError("");
    setPipelinePaused(false);
    try {
      await runStep("skill-requirement", "", effectivePrompt);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function runPipeline() {
    setRunning(true);
    setError("");
    setSteps([]);
    setQuestionAnswers({});
    setPipelinePaused(false);
    let context = "";

    try {
      for (const skill of skills) {
        context = await runStep(skill.slug, context);
        if (!context) break;

        if (skill.slug === "skill-requirement") {
          const questions = parseOpenQuestions(context);
          if (questions.length > 0 && !allQuestionsAnswered(questions, {})) {
            setPipelinePaused(true);
            break;
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  function clearResults() {
    setSteps([]);
    setQuestionAnswers({});
    setPipelinePaused(false);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Tạo Web bằng Skills</h1>
        <p>
          Chạy pipeline <code>skill-requirement → skill-plan → skill-implement</code> qua Cursor
          SDK. Token mỗi bước được ghi và cộng dồn ở sidebar.
        </p>
      </header>

      <div className="card form-card">
        <label htmlFor="prompt">Yêu cầu</label>
        <textarea
          id="prompt"
          rows={4}
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder="Tạo web theo yêu cầu user"
          disabled={running}
        />

        <label htmlFor="cwd">Thư mục làm việc (cwd, tùy chọn)</label>
        <input
          id="cwd"
          type="text"
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="VD: C:\...\2026_13_7_2026_16_7 hoặc C:\...\currency-converter"
          disabled={running}
        />

        <div className="actions">
          <button type="button" className="btn-primary" disabled={running} onClick={runPipeline}>
            {running ? "Đang chạy..." : "▶ Chạy full pipeline"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={running}
            onClick={clearResults}
          >
            Xóa kết quả
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {pipelinePaused && (
        <div className="alert info">
          Pipeline tạm dừng — trả lời câu hỏi bên dưới bước Requirement, rồi bấm{" "}
          <strong>Áp dụng câu trả lời & chạy lại Requirement</strong> trước khi chạy Plan.
        </div>
      )}

      <div className="skill-steps">
        {skills.map((skill) => (
          <div key={skill.slug} className="card skill-step-card">
            <div className="skill-step-head">
              <h2>
                {skill.emoji} {skill.label}
              </h2>
              <code>{skill.slug}</code>
              <button
                type="button"
                className="btn-secondary"
                disabled={running}
                onClick={() => runSingle(skill.slug)}
              >
                Chạy bước này
              </button>
            </div>

            {steps
              .filter((s) => s.skillSlug === skill.slug)
              .map((step, i) => (
                <div key={`${step.runId}-${i}`} className="step-result">
                  <div className="step-meta">
                    <span className={`badge status-${step.status}`}>{step.status}</span>
                    {step.usage && (
                      <span className="badge token-badge">
                        {formatNumber(step.usage.totalTokens)} tokens
                      </span>
                    )}
                    {step.durationMs != null && (
                      <span className="muted">{(step.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  <pre className="output">{step.output || "(không có output)"}</pre>

                  {step.reportPath && (
                    <div className="report-saved">
                      <strong>Đã lưu báo cáo:</strong>
                      <code>{step.reportPath}</code>
                      {step.reportStampedPath && step.reportStampedPath !== step.reportPath && (
                        <span className="muted"> (bản có timestamp: {step.reportStampedPath})</span>
                      )}
                    </div>
                  )}

                  {skill.slug === "skill-requirement" &&
                    i === steps.filter((s) => s.skillSlug === skill.slug).length - 1 &&
                    openQuestions.length > 0 && (
                      <OpenQuestionsForm
                        questions={openQuestions}
                        answers={questionAnswers}
                        onChange={setQuestionAnswers}
                        onApply={applyAnswersAndRerunRequirement}
                        disabled={running}
                      />
                    )}

                  {skill.slug === "skill-requirement" &&
                    i === steps.filter((s) => s.skillSlug === skill.slug).length - 1 &&
                    openQuestions.length === 0 &&
                    step.output &&
                    /câu hỏi|open questions|làm rõ/i.test(step.output) && (
                      <p className="muted parse-hint">
                        Không tự động nhận dạng được câu hỏi A/B/C. Hãy trả lời trực tiếp trong ô{" "}
                        <strong>Yêu cầu</strong> rồi chạy lại Requirement.
                      </p>
                    )}
                </div>
              ))}
          </div>
        ))}
      </div>

      {openQuestions.length > 0 && !answersComplete && (
        <p className="muted footer-hint">
          Đã nhận {openQuestions.length} câu hỏi — chọn đáp án rồi bấm nút xác nhận ngay dưới kết
          quả Requirement.
        </p>
      )}
    </div>
  );
}

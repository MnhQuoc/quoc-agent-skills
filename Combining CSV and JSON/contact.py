"""
Gộp CSV usage từ Cursor Dashboard (token chính xác, không có session id)
với JSON export local (có composerId / session id + timestamp).

Khớp theo thời gian:
  1. Cửa sổ session [first_message, last_message + buffer]
  2. merge_asof tới message gần nhất (user message ưu tiên)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gộp CSV token dashboard với JSON session Cursor theo timestamp."
    )
    parser.add_argument(
        "--csv",
        default="usage-events-2026-07-22.csv",
        help="File CSV export từ Cursor Dashboard (Usage → Export).",
    )
    parser.add_argument(
        "--json",
        dest="json_path",
        default="cursor_history.json",
        help="File JSON export chat history (composerId + messages.createdAt).",
    )
    parser.add_argument(
        "--output",
        default="full_session_detail_report.csv",
        help="File CSV báo cáo gom theo session.",
    )
    parser.add_argument(
        "--detail-output",
        default="merged_events_detail.csv",
        help="File CSV chi tiết từng dòng CSV đã gán session.",
    )
    parser.add_argument(
        "--tolerance",
        default="30s",
        help="Ngưỡng lệch thời gian tối đa khi khớp message (vd: 30s, 2min).",
    )
    parser.add_argument(
        "--session-buffer",
        default="3min",
        help="Thêm buffer sau message cuối của session (billing thường trễ vài phút).",
    )
    return parser.parse_args()


def load_usage_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if "Date" not in df.columns:
        raise ValueError(f"CSV thiếu cột 'Date': {path}")

    df = df.copy()
    df["EventTime"] = pd.to_datetime(df["Date"], utc=True, errors="coerce")
    if df["EventTime"].isna().all():
        raise ValueError(f"Không parse được cột Date trong {path}")

    if "Total Tokens" in df.columns:
        df["TotalTokens"] = pd.to_numeric(df["Total Tokens"], errors="coerce").fillna(0).astype(int)
    else:
        df["TotalTokens"] = 0

    if "Output Tokens" in df.columns:
        df["OutputTokens"] = pd.to_numeric(df["Output Tokens"], errors="coerce").fillna(0).astype(int)
    else:
        df["OutputTokens"] = 0

    if "Input (w/o Cache Write)" in df.columns:
        input_no_cache = pd.to_numeric(df["Input (w/o Cache Write)"], errors="coerce").fillna(0)
        input_cache = pd.to_numeric(
            df.get("Input (w/ Cache Write)", 0), errors="coerce"
        ).fillna(0)
        cache_read = pd.to_numeric(df.get("Cache Read", 0), errors="coerce").fillna(0)
        df["InputTokens"] = (input_no_cache + input_cache + cache_read).astype(int)
    else:
        df["InputTokens"] = (df["TotalTokens"] - df["OutputTokens"]).clip(lower=0).astype(int)

    df["Model"] = df["Model"].astype(str) if "Model" in df.columns else ""
    return df.sort_values("EventTime").reset_index(drop=True)


def _message_text(msg: dict) -> str:
    for key in ("text", "content", "rawText", "message"):
        value = msg.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _message_time(msg: dict) -> pd.Timestamp | pd.NaT:
    for key in ("createdAt", "timestamp", "time", "date"):
        value = msg.get(key)
        if value is None:
            continue
        if isinstance(value, (int, float)):
            unit = "ms" if value > 1_000_000_000_000 else "s"
            return pd.to_datetime(value, unit=unit, utc=True, errors="coerce")
        return pd.to_datetime(value, utc=True, errors="coerce")
    return pd.NaT


def _normalize_sessions(raw) -> list[dict]:
    if isinstance(raw, dict):
        for key in ("sessions", "composers", "data", "items", "conversations"):
            if key in raw and isinstance(raw[key], list):
                return raw[key]
        return [raw]
    if isinstance(raw, list):
        return raw
    raise ValueError("JSON không có dạng list session hoặc object chứa sessions/composers.")


def load_cursor_json(path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    sessions = _normalize_sessions(raw)
    message_rows: list[dict] = []
    window_rows: list[dict] = []

    for session in sessions:
        session_id = (
            session.get("composerId")
            or session.get("conversationId")
            or session.get("id")
            or session.get("sessionId")
        )
        if not session_id:
            continue

        messages = session.get("messages") or session.get("conversation") or []
        timestamps: list[pd.Timestamp] = []
        prompts: list[str] = []

        for msg in messages:
            if not isinstance(msg, dict):
                continue
            ts = _message_time(msg)
            if pd.isna(ts):
                continue

            role = str(msg.get("type") or msg.get("role") or "").lower()
            text = _message_text(msg)
            is_user = role in ("user", "human", "1") or msg.get("isUser") is True

            timestamps.append(ts)
            message_rows.append(
                {
                    "Session_ID": str(session_id),
                    "Timestamp": ts,
                    "Prompt_Text": text[:100],
                    "Is_User": is_user,
                }
            )
            if is_user and text:
                prompts.append(text[:100])

        if not timestamps:
            continue

        window_rows.append(
            {
                "Session_ID": str(session_id),
                "Session_Start": min(timestamps),
                "Session_End": max(timestamps),
                "First_Prompt": prompts[0] if prompts else "",
                "User_Turns": len(prompts),
            }
        )

    if not message_rows:
        raise ValueError(f"JSON không có message timestamp hợp lệ: {path}")

    df_messages = pd.DataFrame(message_rows).sort_values("Timestamp").reset_index(drop=True)
    df_windows = pd.DataFrame(window_rows).sort_values("Session_Start").reset_index(drop=True)
    return df_messages, df_windows


def assign_session_by_window(
    df_csv: pd.DataFrame,
    df_windows: pd.DataFrame,
    tolerance: pd.Timedelta,
    session_buffer: pd.Timedelta,
) -> pd.Series:
    assigned = pd.Series(index=df_csv.index, dtype="object")

    for idx, row in df_csv.iterrows():
        event_time = row["EventTime"]
        candidates = df_windows[
            (df_windows["Session_Start"] - tolerance <= event_time)
            & (event_time <= df_windows["Session_End"] + session_buffer + tolerance)
        ]
        if len(candidates) == 1:
            assigned.at[idx] = candidates.iloc[0]["Session_ID"]
        elif len(candidates) > 1:
            # Trùng cửa sổ: chọn session có midpoint gần event nhất
            distances = (candidates["Session_Start"] + (candidates["Session_End"] - candidates["Session_Start"]) / 2 - event_time).abs()
            assigned.at[idx] = candidates.iloc[distances.argmin()]["Session_ID"]

    return assigned


def assign_session_by_nearest_message(
    df_csv: pd.DataFrame,
    df_messages: pd.DataFrame,
    tolerance: pd.Timedelta,
    prefer_user: bool = True,
) -> pd.DataFrame:
    source = df_messages
    if prefer_user and df_messages["Is_User"].any():
        user_only = df_messages[df_messages["Is_User"]].copy()
        if not user_only.empty:
            source = user_only

    merged = pd.merge_asof(
        df_csv.sort_values("EventTime"),
        source.sort_values("Timestamp"),
        left_on="EventTime",
        right_on="Timestamp",
        direction="nearest",
        tolerance=tolerance,
    )
    return merged.sort_index()


def build_reports(
    df_csv: pd.DataFrame,
    df_messages: pd.DataFrame,
    df_windows: pd.DataFrame,
    tolerance: pd.Timedelta,
    session_buffer: pd.Timedelta,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    window_ids = assign_session_by_window(df_csv, df_windows, tolerance, session_buffer)

    unmatched_mask = window_ids.isna()
    df_unmatched = df_csv[unmatched_mask].copy()
    df_matched_window = df_csv[~unmatched_mask].copy()
    df_matched_window["Session_ID"] = window_ids[~unmatched_mask].values

    if not df_unmatched.empty:
        merged_unmatched = assign_session_by_nearest_message(
            df_unmatched, df_messages, tolerance, prefer_user=True
        )
        merged_unmatched["Match_Method"] = merged_unmatched["Session_ID"].apply(
            lambda x: "nearest_message" if pd.notna(x) else "unmatched"
        )
    else:
        merged_unmatched = pd.DataFrame(columns=list(df_csv.columns) + ["Session_ID", "Timestamp", "Prompt_Text", "Match_Method"])

    df_matched_window["Match_Method"] = "session_window"
    df_matched_window["Timestamp"] = pd.NaT
    df_matched_window["Prompt_Text"] = ""

    detail = pd.concat([df_matched_window, merged_unmatched], ignore_index=True)
    detail = detail.sort_values("EventTime").reset_index(drop=True)

    # Bổ sung metadata session
    detail = detail.merge(
        df_windows[["Session_ID", "First_Prompt", "User_Turns", "Session_Start", "Session_End"]],
        on="Session_ID",
        how="left",
    )

    matched = detail[detail["Session_ID"].notna()].copy()
    summary = (
        matched.groupby("Session_ID", as_index=False)
        .agg(
            Session_Start=("Session_Start", "first"),
            Session_End=("Session_End", "first"),
            User_Turns=("User_Turns", "first"),
            First_Prompt=("First_Prompt", "first"),
            Total_Requests=("EventTime", "count"),
            Total_Tokens=("TotalTokens", "sum"),
            Input_Tokens=("InputTokens", "sum"),
            Output_Tokens=("OutputTokens", "sum"),
            Models=("Model", lambda s: " | ".join(sorted({m for m in s if m and m != "nan"}))),
            Matched_By_Window=("Match_Method", lambda s: int((s == "session_window").sum())),
            Matched_By_Message=("Match_Method", lambda s: int((s == "nearest_message").sum())),
        )
        .sort_values("Session_Start")
        .reset_index(drop=True)
    )

    return summary, detail


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    args = parse_args()
    csv_path = Path(args.csv)
    json_path = Path(args.json_path)
    tolerance = pd.Timedelta(args.tolerance)
    session_buffer = pd.Timedelta(args.session_buffer)

    if not csv_path.exists():
        print(f"Không tìm thấy CSV: {csv_path}", file=sys.stderr)
        return 1
    if not json_path.exists():
        print(f"Không tìm thấy JSON: {json_path}", file=sys.stderr)
        return 1

    df_csv = load_usage_csv(csv_path)
    df_messages, df_windows = load_cursor_json(json_path)

    summary, detail = build_reports(
        df_csv, df_messages, df_windows, tolerance, session_buffer
    )

    summary.to_csv(args.output, index=False)
    detail.to_csv(args.detail_output, index=False)

    unmatched = int(detail["Session_ID"].isna().sum())
    print(f"Đã xử lý {len(df_csv)} dòng CSV, {len(df_windows)} session JSON.")
    print(f"Gom được {len(summary)} session → {args.output}")
    print(f"Chi tiết từng event → {args.detail_output}")
    if unmatched:
        print(f"Cảnh báo: {unmatched} dòng CSV không khớp session (tăng --tolerance hoặc --session-buffer).")
    else:
        print("Tất cả dòng CSV đã được gán session.")

    print("\n--- Tóm tắt theo session ---")
    print(summary.to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

import { HelpCircle } from "lucide-react";
import { memo, useRef, useState } from "react";
import type { Message } from "../core/types";
import { useTranslation } from "../i18n";

/**
 * Inline card for an agent `clarify` tool call. Renders the question with
 * quick-pick buttons (when the question listed options), a free-text reply, and
 * a "让 Hermes 决定" skip control.
 *
 * The `/v1/runs` transport has no clarify-resolve endpoint, so an answer is
 * delivered as the next message (the gateway's text-fallback contract); the
 * parent flips `clarifyResolved` once answered so the card becomes read-only.
 */
export const ClarifyCard = memo(function ClarifyCard({
  message,
  formatTime,
  onAnswer,
}: {
  message: Message;
  formatTime: (timestamp: number) => string;
  onAnswer: (answer: string) => void;
}) {
  const t = useTranslation();
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // Synchronous guard: `submitted` state lags within the same tick, so a fast
  // double-click could otherwise fire `onAnswer` twice.
  const submittedRef = useRef(false);

  const resolved = Boolean(message.clarifyResolved);
  const choices = message.clarifyChoices ?? [];

  const submit = (answer: string) => {
    if (resolved || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    onAnswer(answer);
  };

  return (
    <article className="message agent message-clarify">
      <div className="message-avatar" aria-hidden="true">
        H
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span>{t("clarify.title")}</span>
          <time>{formatTime(message.createdAt)}</time>
        </div>
        <div className="chat-clarify">
          <div className="chat-clarify-question">
            <HelpCircle size={15} />
            <span>{message.content}</span>
          </div>

          {resolved ? (
            <div className="chat-clarify-answer">
              {message.clarifyAnswer && message.clarifyAnswer.trim()
                ? message.clarifyAnswer
                : t("clarify.letHermesDecided")}
            </div>
          ) : (
            <>
              {choices.length > 0 && (
                <div className="chat-clarify-choices">
                  {choices.map((choice, index) => (
                    <button
                      key={`${message.id}-choice-${index}`}
                      type="button"
                      className="chat-clarify-choice"
                      disabled={submitted}
                      onClick={() => submit(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}
              <div className="chat-clarify-open">
                <textarea
                  className="chat-clarify-textarea"
                  rows={2}
                  value={text}
                  placeholder={choices.length > 0 ? t("clarify.placeholderOr") : t("clarify.placeholder")}
                  disabled={submitted}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      if (text.trim()) submit(text);
                    }
                  }}
                />
                <div className="chat-clarify-actions">
                  <button
                    type="button"
                    className="chat-clarify-skip"
                    disabled={submitted}
                    onClick={() => submit("")}
                  >
                    {t("clarify.letHermesDecide")}
                  </button>
                  <button
                    type="button"
                    className="chat-clarify-send"
                    disabled={submitted || !text.trim()}
                    onClick={() => submit(text)}
                  >
                    {t("clarify.send")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
});

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Check,
  MessageCircle,
  Send,
  Loader2,
} from "lucide-react";

import Drawer from "../layout/Drawer";

import {
  sendChatMessage,
} from "../../services/chat";

function ChatDrawer({
  open,
  onClose,
  jobSpec,
  onSuggestion,
}) {
  const [
    messages,
    setMessages,
  ] = useState([
    {
      role: "assistant",
      text:
        "Hi — I can help configure your collection job. Tell me what imagery you need.",
    },
  ]);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    pendingSuggestion,
    setPendingSuggestion,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    sessionId,
  ] = useState(() =>
    crypto.randomUUID()
  );

  const scrollRef =
    useRef(null);

  useEffect(() => {
    const container =
      scrollRef.current;

    if (container) {
      container.scrollTop =
        container.scrollHeight;
    }
  }, [
    messages,
    pendingSuggestion,
  ]);

  const send = async () => {
    const value =
      message.trim();

    if (
      !value ||
      loading
    ) {
      return;
    }

    setMessages(
      (current) => [
        ...current,
        {
          role: "user",
          text: value,
        },
      ]
    );

    setMessage("");
    setLoading(true);

    try {
      const response =
        await sendChatMessage(
          {
            sessionId,
            message: value,
            formState:
              jobSpec,
          }
        );

      setMessages(
        (current) => [
          ...current,
          {
            role:
              "assistant",
            text:
              response.reply,
          },
          ...(response.warnings ||
            []).map(
            (warning) => ({
              role:
                "assistant",
              text: `⚠ ${warning}`,
            })
          ),
        ]
      );

      const suggestion =
        response.field_suggestions;

      setPendingSuggestion(
        suggestion &&
          Object.keys(
            suggestion
          ).length > 0
          ? suggestion
          : null
      );
    } catch {
      setMessages(
        (current) => [
          ...current,
          {
            role:
              "assistant",
            text:
              "The chat service is currently unavailable.",
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion =
    () => {
      if (
        !pendingSuggestion
      ) {
        return;
      }

      onSuggestion(
        pendingSuggestion
      );

      setMessages(
        (current) => [
          ...current,
          {
            role:
              "assistant",
            text:
              "Applied to the Job Setup form.",
          },
        ]
      );

      setPendingSuggestion(
        null
      );
    };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Assistant"
      icon={
        MessageCircle
      }
    >
      <div
        className="chat-message-list"
        ref={scrollRef}
      >
        {messages.map(
          (
            item,
            index
          ) => (
            <div
              key={index}
              className={`chat-message ${
                item.role ===
                "user"
                  ? "chat-user"
                  : "chat-assistant"
              }`}
            >
              <div className="message-role">
                {item.role ===
                "user"
                  ? "You"
                  : "Assistant"}
              </div>

              <div className="message-bubble">
                {item.text}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="chat-loading">
            <Loader2
              size={14}
              className="spinner"
            />
            Assistant is thinking...
          </div>
        )}

        {pendingSuggestion && (
          <div className="suggestion-card">
            <div className="suggestion-heading">
              Suggested Changes
            </div>

            {pendingSuggestion.startDate && (
              <div className="suggestion-row">
                <span>
                  Start
                </span>

                <strong>
                  {
                    pendingSuggestion.startDate
                  }
                </strong>
              </div>
            )}

            {pendingSuggestion.endDate && (
              <div className="suggestion-row">
                <span>
                  End
                </span>

                <strong>
                  {
                    pendingSuggestion.endDate
                  }
                </strong>
              </div>
            )}

            {pendingSuggestion.cloudMax !==
              undefined && (
              <div className="suggestion-row">
                <span>
                  Cloud
                </span>

                <strong>
                  {
                    pendingSuggestion.cloudMax
                  }
                  %
                </strong>
              </div>
            )}

            {pendingSuggestion.outputName && (
              <div className="suggestion-row">
                <span>
                  Output
                </span>

                <strong>
                  {
                    pendingSuggestion.outputName
                  }
                </strong>
              </div>
            )}

            <div className="suggestion-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  setPendingSuggestion(
                    null
                  )
                }
              >
                Dismiss
              </button>

              <button
                type="button"
                className="primary-button small-button"
                onClick={
                  applySuggestion
                }
              >
                <Check
                  size={14}
                />
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="chat-compose">
        <input
          value={message}
          placeholder="Ask about this job..."
          onChange={(
            event
          ) =>
            setMessage(
              event.target
                .value
            )
          }
          onKeyDown={(
            event
          ) => {
            if (
              event.key ===
              "Enter"
            ) {
              send();
            }
          }}
        />

        <button
          type="button"
          className="primary-button chat-send"
          onClick={send}
          disabled={loading}
        >
          <Send size={15} />
        </button>
      </div>

      <p className="chat-guardrail">
        The assistant can
        suggest changes. Only
        you can submit the job.
      </p>
    </Drawer>
  );
}

export default ChatDrawer;
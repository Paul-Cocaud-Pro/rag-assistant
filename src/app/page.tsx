"use client";
import { useState, useRef, useEffect } from "react";
import StarryBackground from "./StarryBackground";
import styles from "./chat.module.css";

type Message = { 
  role: "user" | "assistant"; 
  content: string; 
  sourceUrls?: string[];
};

const SUGGESTIONS = [
  "Comment se forme un trou noir ?",
  "Qu'est-ce qu'une naine blanche ?",
  "Que voit le télescope James Webb ?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll en bas à chaque nouveau contenu
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const ask = (question: string) => {
    if (!question.trim() || isLoading) return;
    void send(question.trim());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  async function send(question: string) {
    const userMessage: Message = { role: "user", content: question };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    setMessages([...newMessages, { role: "assistant", content: "" }]);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: newMessages.map((m) => ({
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        })),
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let sourceUrls: string[] = [];
    let firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      
      if (firstChunk) {
        firstChunk = false;
        const newlineIndex = chunk.indexOf("\n");
        if (newlineIndex !== -1) {
          try {
            const meta = JSON.parse(chunk.slice(0, newlineIndex));
            if (meta.__sources) sourceUrls = meta.__sources;
            fullText += chunk.slice(newlineIndex + 1);
          } catch {
            fullText += chunk;
          }
        } else {
          fullText += chunk;
        }
      } else {
        fullText += chunk;
      }
      setMessages([...newMessages, { role: "assistant", content: fullText, sourceUrls }]);
    }

    setIsLoading(false);
  }

  const reset = () => {
    setMessages([]);
    setInput("");
    setIsLoading(false);
  };

  const isEmpty = messages.length === 0 && !isLoading;
  const showLoader =
    isLoading && messages[messages.length - 1]?.content === "";

  return (
    <>
      <StarryBackground />
      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <img src="/logo.png" alt="" width={32} height={32} />
            <span className={styles.headerTitle}>
              Astralis
            </span>
          </div>
          <button
            onClick={reset}
            title="Nouvelle conversation"
            className={styles.resetBtn}
          >
            ↺
          </button>
        </header>
        <div
          ref={scrollRef}
          className={styles.conversation}
        >
          {isEmpty && (
            <div className={styles.empty}>
              {/* <div className={styles.logoWrapper}>
                <div
                  className={styles.logoGlow}
                />
                <img src="/logo.png" alt="" className={styles.logoLarge} />
              </div> */}
              <div>
                <div className={styles.emptyTitle}>
                  Pose une question sur l&apos;astronomie…
                </div>
                <div className={styles.emptySubtitle}>
                  Réponses sourcées depuis la base documentaire
                </div>
              </div>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className={styles.suggestionBtn}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                className={isUser ? styles.rowUser : styles.rowAssistant}
              >
                {isUser ? (
                  <div className={styles.bubbleUser}>
                    <p>{m.content}</p>
                  </div>
                ) : (
                  <div className={styles.bubbleAssistant}>
                    <p>{m.content}</p>

                    {!isLoading && m.sourceUrls && m.sourceUrls.length > 0 && (
                      <div className={styles.sourcesWrapper}>
                        <div className={styles.sourcesLabel}>Sources</div>
                        <ul className={styles.sourceUrlsList}>
                          {m.sourceUrls.map((url, si) => (
                            <li key={si}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.sourceUrl}
                              >
                                {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!isLoading && m.content && (
                      <button
                        onClick={() => navigator.clipboard?.writeText(m.content)}
                        className={styles.copyBtn}
                      >
                        Copier
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {showLoader && (
            <div
              className={styles.loader}
            >
              <span className={styles.loaderText}>
                Recherche dans les étoiles
              </span>
              <span className={styles.loaderDots}>
                {[0, 0.2, 0.4].map((d) => (
                  <span
                    key={d}
                    className={styles.dot}
                  />
                ))}
              </span>
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className={styles.inputBar}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pose une question sur l'astronomie…"
            disabled={isLoading}
            className={styles.input}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={styles.sendBtn}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0a0b12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      </main>
    </>
  );
}

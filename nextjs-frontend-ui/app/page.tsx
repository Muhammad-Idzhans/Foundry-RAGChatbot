"use client";

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { message } from 'antd';

export default function ChatbotUI() {

  // ---------------- STATE ----------------
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const [streamedText, setStreamedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const recognizerRef = useRef<any>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [isMultiLine, setIsMultiLine] = useState(false);
  const MAX_HEIGHT = 200;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 🌙 Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Load saved theme on mount + respect OS preference
  useEffect(() => {
    const saved = localStorage.getItem('chatbot-theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial = prefersDark ? 'dark' : 'light';
      setTheme(initial);
      document.documentElement.setAttribute('data-theme', initial);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('chatbot-theme', next);
  };

  // Suggestion prompts for the welcome screen
  const suggestions = [
    { icon: "bi-lightbulb", title: "Explain a concept", subtitle: "Break down complex topics simply" },
    { icon: "bi-file-earmark-text", title: "Summarize a document", subtitle: "Get key insights in seconds" },
    { icon: "bi-search", title: "Find information", subtitle: "Search the knowledge base" },
    { icon: "bi-chat-square-text", title: "Have a conversation", subtitle: "Ask me anything to get started" },
  ];

  // ---------------- HANDLERS ----------------
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 150);
    }
  };

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages.length > 0 || streamedText) {
      chatContainerRef.current?.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, streamedText]);

  const handleBlobLink = async (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.includes('.blob.core.windows.net')) return;
    e.preventDefault();
    const hideLoading = message.loading('Preparing secure document link...', 0);
    try {
      const res = await fetch('/api/blob-sas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: href }),
      });
      const data = await res.json();
      hideLoading();
      if (data.signedUrl) {
        message.success('Document opened successfully!', 2);
        window.open(data.signedUrl, '_blank');
      } else {
        message.error('Unable to open this document. Please try again.', 3);
      }
    } catch (error) {
      hideLoading();
      console.error('Error fetching signed URL:', error);
      message.error('Unable to open this document. Please check your connection.', 3);
    }
  };

  const sendMessage = async (overrideText?: string) => {
    const textToSend = overrideText ?? input;
    if (!textToSend.trim() || isLoading || isStreaming) return;

    const userMessage = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content, conversationId }),
      });
      const data = await response.json();

      if (data.reply) {
        if (data.conversationId) setConversationId(data.conversationId);
        setIsLoading(false);
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        console.error("Agent returned an error:", data.error);
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Communication failed:", error);
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
    setStreamedText("");
    setIsStreaming(false);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const currentScrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${currentScrollHeight}px`;
      setIsMultiLine(currentScrollHeight > 60);
      textareaRef.current.style.overflowY = currentScrollHeight >= MAX_HEIGHT ? 'auto' : 'hidden';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        sendMessage();
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync(() => {
          recognizerRef.current.close();
          recognizerRef.current = null;
        });
      }
      setIsListening(false);
      return;
    }
    try {
      const res = await fetch("/api/speech-token");
      const { token, endpoint } = await res.json();
      const sdk = await import("microsoft-cognitiveservices-speech-sdk");
      const speechConfig = sdk.SpeechConfig.fromEndpoint(new URL(endpoint));
      speechConfig.authorizationToken = token;
      const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(["en-US", "ms-MY", "zh-CN"]);
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig);
      recognizerRef.current = recognizer;
      recognizer.recognized = (_s: any, e: any) => {
        if (e.result.text) {
          setInput((prev) => prev ? prev + " " + e.result.text : e.result.text);
        }
      };
      recognizer.startContinuousRecognitionAsync();
      setIsListening(true);
    } catch (error) {
      console.error("Speech recognition failed:", error);
      setIsListening(false);
    }
  };

  // ---------------- RENDER ----------------
  return (
    <div className="d-flex flex-column vh-100 app-background position-relative overflow-hidden">

      {/* Decorative background orbs */}
      <div className="bg-orb bg-orb-1"></div>
      <div className="bg-orb bg-orb-2"></div>

      {/* ---------- HEADER ---------- */}
      <header className="glass-header position-relative" style={{ zIndex: 5 }}>
        <div className="w-100 p-2 px-3 d-flex justify-content-between align-items-center mx-auto" style={{ maxWidth: '1000px' }}>
          <div className="d-flex align-items-center">
            <div className="brand-logo d-flex align-items-center justify-content-center me-3">
              <i className="bi bi-stars text-white"></i>
            </div>
            <div>
              <h5 className="m-0 p-0 fw-bold app-title" style={{ letterSpacing: '-0.01em' }}>RAG Demo Chatbot</h5>
              <span className="app-subtitle" style={{ fontSize: '0.8rem' }}>
                Powered by <span className="brand-gradient-text fw-semibold">Microsoft Foundry</span>
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            {/* 💬 New Chat Button — always visible and clickable */}
            <button
              onClick={clearChat}
              disabled={isLoading || isStreaming}
              className="new-chat-btn d-flex align-items-center gap-2"
              title="Start a new chat"
            >
              <i className="bi bi-plus-lg"></i>
              <span className="d-none d-sm-inline">New Chat</span>
            </button>

            {/* 🌙 Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="theme-toggle d-flex align-items-center justify-content-center"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              <i className={`bi ${theme === 'light' ? 'bi-moon-stars' : 'bi-sun'}`}></i>
            </button>
          </div>
        </div>
      </header>

      {/* ---------- MAIN ---------- */}
      <main className="flex-grow-1 overflow-hidden d-flex justify-content-center p-3 p-md-4 position-relative" style={{ zIndex: 2 }}>
        <div className="d-flex flex-column w-100 h-100" style={{ maxWidth: '1000px' }}>

          {/* Chat Area */}
          <div className="card flex-grow-1 border-0 bg-transparent d-flex flex-column overflow-hidden position-relative">
            <div
              className="card-body overflow-auto d-flex flex-column p-3 p-md-4 gap-4 scrollbar-hide"
              ref={chatContainerRef}
              onScroll={handleScroll}
            >

              {messages.length === 0 ? (

                /* ---------- WELCOME SCREEN ---------- */
                <div className="h-100 w-100 d-flex flex-column align-items-center justify-content-center text-center animate-fade-in-up">

                  {/* Animated Orb Logo */}
                  <div className="welcome-orb mb-4">
                    <i className="bi bi-stars text-white"></i>
                  </div>

                  <h1 className="display-5 fw-bold mb-2 welcome-title">
                    How can I help you <span className="brand-gradient-text">today</span>?
                  </h1>
                  <p className="welcome-subtitle mb-5" style={{ fontSize: '1rem', maxWidth: '500px' }}>
                    Ask me anything, or pick a suggestion below to get started.
                  </p>

                  {/* Suggestion Cards */}
                  <div className="row g-3 w-100" style={{ maxWidth: '720px' }}>
                    {suggestions.map((s, idx) => (
                      <div key={idx} className="col-12 col-md-6">
                        <button
                          className="suggestion-card w-100 text-start p-3 d-flex align-items-start gap-3"
                          onClick={() => sendMessage(s.title + " — " + s.subtitle)}
                        >
                          <div className="suggestion-icon d-flex align-items-center justify-content-center flex-shrink-0">
                            <i className={`bi ${s.icon}`}></i>
                          </div>
                          <div>
                            <div className="fw-semibold suggestion-title" style={{ fontSize: '0.92rem' }}>{s.title}</div>
                            <div className="suggestion-subtitle" style={{ fontSize: '0.8rem' }}>{s.subtitle}</div>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

              ) : (

                /* ---------- CHAT MESSAGES ---------- */
                <>
                  {messages.map((msg, index) => (
                    msg.role === "assistant" ? (
                      <div key={index} className="d-flex align-items-start gap-3 w-100 animate-fade-in-up">
                        <div className="assistant-avatar d-flex align-items-center justify-content-center flex-shrink-0">
                          <i className="bi bi-stars text-white"></i>
                        </div>
                        <div className="d-flex flex-column align-items-start" style={{ maxWidth: '80%' }}>
                          <div className="chat-bubble assistant-bubble p-3 border-0 text-break">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: ({ node, href, ...props }) => <a
                                  {...props}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => href && handleBlobLink(e, href)}
                                />,
                                ul: ({ node, ...props }) => <ul className="ps-4 mb-1 list-disc" {...props} />,
                                ol: ({ node, ...props }) => <ol className="ps-4 mb-1 list-decimal" {...props} />,
                                li: ({ node, ...props }) => <li className="mb-0" {...props} />
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={index} className="d-flex justify-content-end w-100 animate-fade-in-up">
                        <div className="chat-bubble user-bubble p-3 text-white border-0 text-break" style={{ maxWidth: '80%' }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, href, ...props }) => <a
                                {...props}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => href && handleBlobLink(e, href)}
                              />,
                              ul: ({ node, ...props }) => <ul className="ps-4 mb-1 list-disc" {...props} />,
                              ol: ({ node, ...props }) => <ol className="ps-4 mb-1 list-decimal" {...props} />,
                              li: ({ node, ...props }) => <li className="mb-0" {...props} />
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )
                  ))}

                  {/* Typing Indicator */}
                  {isLoading && (
                    <div className="d-flex align-items-start gap-3 w-100">
                      <div className="assistant-avatar d-flex align-items-center justify-content-center flex-shrink-0">
                        <i className="bi bi-stars text-white"></i>
                      </div>
                      <div className="d-flex flex-column align-items-start" style={{ maxWidth: '80%' }}>
                        <div className="chat-bubble assistant-bubble p-3 border-0 d-flex align-items-center justify-content-center" style={{ height: '44px' }}>
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div ref={messageEndRef}></div>
            </div>

            {/* Scroll-to-bottom button */}
            {showScrollButton && (
              <button
                onClick={scrollToBottom}
                className="position-absolute start-50 translate-middle-x scroll-btn d-flex align-items-center justify-content-center animate-fade-in"
                style={{ bottom: '20px', zIndex: 10 }}
                title="Scroll to bottom"
              >
                <i className="bi bi-arrow-down"></i>
              </button>
            )}
          </div>

          {/* ---------- INPUT AREA ---------- */}
          <div className="input-wrapper mt-3 mb-2">
            <div className="input-container position-relative">
              <textarea
                ref={textareaRef}
                className="form-control input-textarea ps-3 pt-3"
                style={{
                  paddingBottom: '50px',
                  paddingRight: '16px',
                  resize: 'none',
                  maxHeight: '200px',
                  overflowY: 'hidden',
                  minHeight: '60px'
                }}
                placeholder="Ask me anything..."
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
              />

              <div className="position-absolute end-0 bottom-0 mb-2 me-2 d-flex align-items-center gap-2">
                <button
                  className={`icon-btn ${isListening ? 'icon-btn-active' : ''}`}
                  disabled={isLoading || isStreaming}
                  title={isListening ? 'Stop Listening' : 'Use Microphone'}
                  onClick={toggleListening}
                >
                  <i className={`bi ${isListening ? 'bi-mic-mute-fill' : 'bi-mic'}`}></i>
                </button>

                <button
                  className="send-btn d-flex align-items-center justify-content-center"
                  onClick={() => sendMessage()}
                  disabled={isLoading || isStreaming || !input.trim()}
                >
                  {isLoading || isStreaming ? (
                    <span className="spinner-border spinner-border-sm text-white" role="status" aria-hidden="true"></span>
                  ) : (
                    <i className="bi bi-arrow-up-short" style={{ fontSize: '1.4rem' }}></i>
                  )}
                </button>
              </div>
            </div>
          </div>

          <small className="footer-hint text-center" style={{ fontSize: '0.75rem' }}>
            Press <kbd className="kbd-hint">Enter</kbd> to send · <kbd className="kbd-hint">Shift</kbd> + <kbd className="kbd-hint">Enter</kbd> for newline
          </small>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, CSSProperties } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFileUpload = async () => {
    if (!file) return alert("Please select a file to upload.");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload file");
      }

      alert("File uploaded successfully!");
      setFile(null);
    } catch (error) {
      console.error("Error uploading file:", error);
      alert(error instanceof Error ? error.message : "Failed to upload file. Try again later.");
    }
  };

  const handleAskQuestion = async () => {
    if (question.trim() === "") return alert("Please enter a question.");

    setIsLoading(true);

    const updatedMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(updatedMessages);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) throw new Error("Failed to fetch answer");

      const data = await response.json();

      setMessages([
        ...updatedMessages,
        { role: "assistant", content: `Context:\n${data.context}` },
        { role: "assistant", content: data.answer },
      ]);
      setQuestion("");
    } catch (error) {
      console.error("Error fetching answer:", error);
      alert("Something went wrong. Try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>AI Assistant</h1>
      </header>

      <div style={styles.chatWindow}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              ...styles.message,
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              backgroundColor: msg.role === "user" ? "#2563EB" : "#374151",
              color: "#fff",
            } as React.CSSProperties}
          >
            {msg.content}
          </div>
        ))}
      </div>

      <div style={styles.inputContainer}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask me anything..."
          style={styles.inputBox}
        />
        <button 
          onClick={handleAskQuestion} 
          style={{
            ...styles.sendButton,
            opacity: isLoading ? 0.7 : 1,
          }} 
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Send"}
        </button>
      </div>

      <div style={styles.uploadSection}>
        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files?.[0] || null)} 
          style={styles.fileInput} 
        />
        <button 
          onClick={handleFileUpload} 
          style={{
            ...styles.uploadButton,
            opacity: !file ? 0.7 : 1,
          }} 
          disabled={!file}
        >
          Upload File
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "#000000",
    color: "#fff",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "20px",
  },
  header: {
    padding: "24px",
    textAlign: "center",
    marginBottom: "32px",
  },
  title: {
    fontSize: "2.5rem",
    fontWeight: "700",
    background: "linear-gradient(to right, #2563EB, #4F46E5)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: "-0.025em",
  },
  chatWindow: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "768px",
    minHeight: "400px",
    border: "1px solid #1F2937",
    borderRadius: "16px",
    padding: "20px",
    overflowY: "auto",
    backgroundColor: "#111111",
    marginBottom: "24px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  },
  message: {
    maxWidth: "80%",
    padding: "12px 18px",
    borderRadius: "16px",
    marginBottom: "12px",
    wordBreak: "break-word",
    fontSize: "0.95rem",
    lineHeight: "1.5",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  inputContainer: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    maxWidth: "768px",
    gap: "12px",
    marginBottom: "24px",
  },
  inputBox: {
    flex: 1,
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid #1F2937",
    fontSize: "1rem",
    backgroundColor: "#111111",
    color: "#fff",
    transition: "border-color 0.3s ease",
    outline: "none",
  },
  sendButton: {
    padding: "16px 24px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(to right, #2563EB, #4F46E5)",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: "500",
    cursor: "pointer",
    transition: "transform 0.2s ease, opacity 0.2s ease",
  },
  uploadSection: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: "768px",
    padding: "16px",
    backgroundColor: "#111111",
    borderRadius: "12px",
    border: "1px solid #1F2937",
  },
  uploadButton: {
    marginLeft: "12px",
    padding: "12px 20px",
    fontSize: "0.95rem",
    background: "linear-gradient(to right, #059669, #10B981)",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "transform 0.2s ease, opacity 0.2s ease",
    fontWeight: "500",
  },
  fileInput: {
    fontSize: "0.95rem",
    color: "#9CA3AF",
  },
};

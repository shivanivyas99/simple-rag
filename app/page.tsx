"use client";

import { useState, CSSProperties } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  const handleFileUpload = async (file: File | null) => {
    if (!file) {
      console.error('No file selected');
      return;
    }

    setUploadStatus("Uploading...");
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setUploadStatus(`Successfully uploaded: ${file.name}`);
      setFile(null);
      
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() === "") return;

    setIsLoading(true);
    const updatedMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(updatedMessages);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ question }),
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("Invalid response from server");
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch answer");
      }

      setMessages([
        ...updatedMessages,
        { role: "assistant" as const, content: data.answer || "No answer provided" },
      ]);
      setQuestion("");
    } catch (error) {
      console.error("Error:", error);
      setMessages([
        ...updatedMessages,
        { 
          role: "assistant" as const, 
          content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}` 
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>AI Document Assistant</h1>
        <p style={styles.subtitle}>Upload documents and ask questions about them</p>
      </header>

      <div style={styles.mainContent}>
        <div style={styles.uploadSection}>
          <h2 style={styles.sectionTitle}>Upload Documents</h2>
          <div style={styles.uploadControls}>
            <input
              type="file"
              accept=".txt,.doc,.docx,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={styles.fileInput}
            />
            <button
              onClick={() => file && handleFileUpload(file)}
              style={{
                ...styles.button,
                ...styles.uploadButton,
                opacity: !file ? 0.7 : 1,
              }}
              disabled={!file}
            >
              {uploadStatus === "Uploading..." ? "Uploading..." : "Upload"}
            </button>
          </div>
          {uploadStatus && <p style={styles.uploadStatus}>{uploadStatus}</p>}
        </div>

        <div style={styles.chatSection}>
          <h2 style={styles.sectionTitle}>Ask Questions</h2>
          <div style={styles.chatWindow}>
            {messages.map((msg, index) => (
              <div
                key={index}
                style={{
                  ...styles.message,
                  ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage),
                }}
              >
                <strong style={styles.messageHeader}>
                  {msg.role === "user" ? "You:" : "Assistant:"}
                </strong>
                <pre style={styles.messageContent}>{msg.content}</pre>
              </div>
            ))}
          </div>

          <form onSubmit={handleAskQuestion} style={styles.inputForm}>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your documents..."
              style={styles.inputBox}
              disabled={isLoading}
            />
            <button
              type="submit"
              style={{
                ...styles.button,
                ...styles.sendButton,
                opacity: isLoading ? 0.7 : 1,
              }}
              disabled={isLoading || !question.trim()}
            >
              {isLoading ? "Processing..." : "Ask"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    padding: "2rem",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    textAlign: "center",
    marginBottom: "2rem",
  },
  title: {
    fontSize: "2.5rem",
    fontWeight: "700",
    background: "linear-gradient(to right, #60a5fa, #3b82f6)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginBottom: "0.5rem",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "1.1rem",
  },
  mainContent: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "2rem",
  },
  sectionTitle: {
    fontSize: "1.5rem",
    fontWeight: "600",
    marginBottom: "1rem",
    color: "#e2e8f0",
  },
  uploadSection: {
    backgroundColor: "#1e293b",
    padding: "1.5rem",
    borderRadius: "1rem",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  uploadControls: {
    display: "flex",
    gap: "1rem",
    alignItems: "center",
  },
  uploadStatus: {
    marginTop: "1rem",
    color: "#94a3b8",
  },
  chatSection: {
    backgroundColor: "#1e293b",
    padding: "1.5rem",
    borderRadius: "1rem",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  chatWindow: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    marginBottom: "1rem",
    maxHeight: "500px",
    overflowY: "auto",
    padding: "1rem",
  },
  message: {
    padding: "1rem",
    borderRadius: "0.5rem",
    maxWidth: "80%",
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#3b82f6",
  },
  assistantMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#374151",
  },
  messageHeader: {
    display: "block",
    marginBottom: "0.5rem",
    fontSize: "0.9rem",
  },
  messageContent: {
    margin: 0,
    whiteSpace: "pre-wrap",
    fontFamily: "inherit",
    fontSize: "0.95rem",
  },
  inputForm: {
    display: "flex",
    gap: "1rem",
  },
  button: {
    padding: "0.75rem 1.5rem",
    borderRadius: "0.5rem",
    border: "none",
    fontSize: "1rem",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s ease",
    color: "white",
  },
  uploadButton: {
    backgroundColor: "#059669",
  },
  sendButton: {
    backgroundColor: "#3b82f6",
  },
  fileInput: {
    flex: 1,
    padding: "0.5rem",
    borderRadius: "0.5rem",
    backgroundColor: "#2d3748",
    color: "#e2e8f0",
    border: "1px solid #4a5568",
  },
  inputBox: {
    flex: 1,
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    border: "1px solid #4a5568",
    backgroundColor: "#2d3748",
    color: "#e2e8f0",
    fontSize: "1rem",
    outline: "none",
    transition: "border-color 0.2s ease",
  },
};

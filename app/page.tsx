"use client";

import { useState } from "react";

export default function Home() {
  const [question, setQuestion] = useState<string>("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
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

    const updatedMessages = [...messages, { role: "user", content: question }];
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
      <div style={styles.header}>
        <h1 style={styles.title}>Ask Me Anything</h1>
      </div>

      <div style={styles.chatWindow}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              ...styles.message,
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              backgroundColor: msg.role === "user" ? "#007BFF" : "#444",
              color: "#fff",
            }}
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
          placeholder="Type your question here..."
          style={styles.inputBox}
        />
        <button onClick={handleAskQuestion} style={styles.sendButton} disabled={isLoading}>
          {isLoading ? "Loading..." : "Send"}
        </button>
      </div>

      <div style={styles.uploadSection}>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button onClick={handleFileUpload} style={styles.uploadButton} disabled={!file}>
          Upload File
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { /* same as before */ },
  header: {
    padding: "20px",
    textAlign: "center" as const,
  },
  title: {
    color: "#fff",
    margin: 0,
  },
  chatWindow: { /* same as before */ },
  message: { /* same as before */ },
  inputContainer: { /* same as before */ },
  inputBox: { /* same as before */ },
  sendButton: { /* same as before */ },
  uploadSection: {
    display: "flex",
    alignItems: "center",
    padding: "10px",
    borderTop: "1px solid #444",
    backgroundColor: "#40414F",
  },
  uploadButton: {
    marginLeft: "10px",
    padding: "10px 20px",
    fontSize: "16px",
    backgroundColor: "#28A745",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
};

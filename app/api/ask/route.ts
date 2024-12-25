// Backend Code Update
import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";

if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME || !process.env.OPENAI_API_KEY) {
  throw new Error("Required environment variables are missing");
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 2000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("All retry attempts failed");
}

function chunkText(text: string, maxTokens: number = 1000, overlap: number = 100) {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxTokens, text.length);
    chunks.push(text.slice(start, end));
    start += maxTokens - overlap;
  }

  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

      const text = await file.text();
      if (!text) return NextResponse.json({ error: "File is empty" }, { status: 400 });

      const chunks = chunkText(text);
      if (!process.env.PINECONE_INDEX_NAME) {
        throw new Error("Pinecone index name is missing");
      }
      const index = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);

      const vectors = await Promise.all(chunks.map(async (chunk, i) => {
        const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-ada-002",
            input: chunk,
          }),
        });

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0]?.embedding;
        if (!embedding) throw new Error(`Failed to generate embedding for chunk ${i + 1}`);

        return {
          id: `doc_${Date.now()}_chunk_${i}`,
          values: embedding,
          metadata: {
            text: chunk,
            filename: file.name,
            chunkIndex: i,
            totalChunks: chunks.length,
          },
        };
      }));

      await retryOperation(() => index.upsert(vectors));
      return NextResponse.json({ message: "File successfully processed", chunks: chunks.length });
    }

    const { question } = await req.json();
    if (!question) return NextResponse.json({ error: "Valid question is required" }, { status: 400 });

    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-ada-002",
        input: question,
      }),
    });

    const embeddingData = await embeddingResponse.json();
    const questionEmbedding = embeddingData.data[0]?.embedding;
    if (!questionEmbedding) throw new Error("Failed to generate embedding for question");

    const searchResults = await index.query({
      vector: questionEmbedding,
      topK: 5,
      includeMetadata: true,
    });

    const matches = searchResults.matches || [];
    if (matches.length === 0) {
      return NextResponse.json({
        error: "No relevant documents found",
        suggestion: "Try rephrasing your question or uploading more documents."
      }, { status: 404 });
    }

    const relevantText = matches.map((match, i) => ({
      chunkIndex: match.metadata?.chunkIndex,
      text: match.metadata?.text,
    }));

    const prompt = `You are an AI assistant. Use the following relevant information to answer the question accurately. 

Relevant Information:
${relevantText.map((item, i) => `Chunk ${item.chunkIndex}: ${typeof item.text === 'string' ? item.text.slice(0, 300) : 'No text available'}`).join('\n\n')}

Question: ${question}`;

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const openAIData = await openAIResponse.json();
    const assistantResponse = openAIData.choices?.[0]?.message?.content;
    if (!assistantResponse) throw new Error("Failed to generate response from OpenAI");

    return NextResponse.json({ answer: assistantResponse.trim() });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "An unknown error occurred",
    }, { status: 500 });
  }
}

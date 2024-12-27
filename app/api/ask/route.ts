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
      console.log('📤 [3] Handling file upload...');
      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) {
        console.log('❌ [4] No file provided in request');
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      console.log('📄 [5] File received:', file.name, 'Size:', file.size, 'bytes');
      const text = await file.text();
      
      if (!text) {
        console.log('❌ [6] Empty file detected');
        return NextResponse.json({ error: "File is empty" }, { status: 400 });
      }

      console.log('📑 [7] Chunking text...');
      const chunks = chunkText(text);
      console.log('✂️ [8] Created', chunks.length, 'chunks');

      const index = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);
      console.log('🌲 [9] Connected to Pinecone index:', process.env.PINECONE_INDEX_NAME);

      console.log('🔄 [10] Generating embeddings for chunks...');
      const vectors = await Promise.all(chunks.map(async (chunk, i) => {
        console.log(`   📍 Processing chunk ${i + 1}/${chunks.length}`);
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
        return {
          id: `doc_${Date.now()}_chunk_${i}`,
          values: embeddingData.data[0]?.embedding,
          metadata: {
            text: chunk,
            filename: file.name,
            chunkIndex: i,
            totalChunks: chunks.length,
          },
        };
      }));

      console.log('💾 [11] Upserting vectors to Pinecone...');
      await retryOperation(() => index.upsert(vectors));
      console.log('✅ [12] File processing complete!');
      
      return NextResponse.json({ message: "File successfully processed", chunks: chunks.length });
    }

    // Handle questions
    const { question, selectedFile } = await req.json();
    if (!question) return NextResponse.json({ error: "Valid question is required" }, { status: 400 });
    if (!selectedFile) return NextResponse.json({ error: "No file selected" }, { status: 400 });

    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);
    
    // Get embeddings for the question
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

    // Query Pinecone with metadata filter for the specific file
    const searchResults = await index.query({
      vector: questionEmbedding,
      topK: 5,
      includeMetadata: true,
      filter: {
        filename: { $eq: selectedFile }
      }
    });

    const matches = searchResults.matches || [];
    if (matches.length === 0) {
      return NextResponse.json({
        error: "No relevant content found in the selected document",
        suggestion: "Try rephrasing your question or selecting a different document."
      }, { status: 404 });
    }

    // Create prompt with relevant chunks
    const relevantText = matches.map(match => match.metadata?.text).join('\n\n');
    const prompt = `Based on the following content from the document "${selectedFile}", please answer the question.

Content:
${relevantText}

Question: ${question}

Please provide a clear and concise answer based only on the information provided above.`;

    // Get response from OpenAI
    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant that provides accurate answers based on the given document content." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const openAIData = await openAIResponse.json();
    const answer = openAIData.choices?.[0]?.message?.content;
    
    if (!answer) throw new Error("Failed to generate response from OpenAI");

    return NextResponse.json({ answer: answer.trim() });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "An unknown error occurred",
    }, { status: 500 });
  }
}

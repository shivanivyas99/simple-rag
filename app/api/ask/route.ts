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
      if (i === maxRetries - 1) throw error; // If last retry, throw error
      console.log(`Attempt ${i + 1} failed, retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      // Increase delay for next retry
      delay *= 2;
    }
  }
  throw new Error("All retry attempts failed");
}

// Function to chunk text with optional overlap
function chunkText(text: string, maxTokens: number = 1000, overlap: number = 100) {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxTokens, text.length);
    const chunk = text.slice(start, end);
    // Only filter out chunks that are mostly non-text
    if (chunk.length > 0 && chunk.replace(/[^\x20-\x7E]/g, '').length > chunk.length * 0.5) {
      chunks.push(chunk);
    }
    start += maxTokens - overlap;
  }

  return chunks;
}

interface PineconeVector {
  id: string;
  values: number[];
  metadata: {
    text: string;
    filename: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      console.log("1. Starting file upload...");

      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) {
        console.error("2. No file provided");
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const text = await file.text();
      if (!text) {
        console.error("3. Uploaded file is empty");
        return NextResponse.json({ error: "File is empty" }, { status: 400 });
      }

      if (!process.env.PINECONE_INDEX_NAME) {
        throw new Error("Pinecone index name is missing");
      }

      const chunks = chunkText(text, 1000, 100);
      console.log(`4. Document split into ${chunks.length} chunks.`);

      const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
      const vectors: PineconeVector[] = [];

      console.log("5. Generating embeddings for all chunks...");
      for (const [i, chunk] of chunks.entries()) {
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

        if (!embedding) {
          console.error(`6. Failed to generate embedding for chunk ${i + 1}`);
          throw new Error(`Failed to generate embedding for chunk ${i + 1}`);
        }

        vectors.push({
          id: `doc_${Date.now()}_chunk_${i}`,
          values: embedding,
          metadata: {
            text: chunk,
            filename: file.name,
            chunkIndex: i,
            totalChunks: chunks.length,
          },
        });
      }
      console.log(`7. All ${chunks.length} embeddings generated successfully.`);

      console.log("8. Uploading vectors to Pinecone...");
      await retryOperation(() => index.upsert(vectors));
      console.log("9. Vectors uploaded to Pinecone successfully");

      return NextResponse.json({
        message: `File successfully processed and stored in ${chunks.length} chunks`,
        filename: file.name,
        chunks: chunks.length,
      });
    }

    // Initialize index before checking stats
    if (!process.env.PINECONE_INDEX_NAME) {
      throw new Error("Pinecone index name is missing");
    }
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    console.log("10. Checking for existing documents...");
    const indexStats = await retryOperation(() => index.describeIndexStats());
    const totalVectors = indexStats.totalRecordCount;

    if (totalVectors === 0) {
      console.log("No documents found in the database. Please upload a document first.");
      return NextResponse.json({ 
        error: "No documents found. Please upload a document first." 
      }, { 
        status: 404 
      });
    }

    console.log(`Found ${totalVectors} vectors in the database.`);
    console.log("11. Generating embedding for the question...");
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      console.error("11. No valid question provided");
      return NextResponse.json({ error: "Valid question is required" }, { status: 400 });
    }

    console.log(`11a. Question received: "${question}". Preparing to find similarities...`);

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

    if (!questionEmbedding) {
      console.error("12. Failed to generate embedding for question");
      throw new Error("Failed to generate embedding for question");
    }

    console.log("13. Querying Pinecone for similarities...");
    const searchResults = await retryOperation(() => index.query({
      vector: questionEmbedding,
      topK: 5,
      includeMetadata: true,
      filter: {
        filename: { $exists: true }
      }
    }));

    const matches = searchResults.matches || [];
    if (matches.length === 0) {
      console.log("14. No relevant documents found");
      return NextResponse.json({ error: "No relevant documents found" }, { status: 404 });
    }

    console.log("15. Similarity Scores with Percentages:");
    matches.forEach((match, index) => {
      const text = typeof match.metadata?.text === "string" 
        ? match.metadata.text.slice(0, 150)  // Show more context
        : "No text";
      const percentage = ((match.score ?? 0) * 100).toFixed(2);
      console.log(`\n  Match ${index + 1}:`);
      console.log(`    Question: "${question}"`);
      console.log(`    Context: ${text}...`);
      console.log(`    Similarity: ${percentage}%`);
      console.log(`    File: ${match.metadata?.filename || 'Unknown'}`);
    });

    return NextResponse.json({ message: "Similarities logged successfully" });
  } catch (error: unknown) {
    console.error("16. Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process request" },
      { status: 500 }
    );
  }
}

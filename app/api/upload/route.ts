import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY is not set');
}

if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error('PINECONE_INDEX_NAME is not set');
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

if (!process.env.PINECONE_ENVIRONMENT) {
  throw new Error('PINECONE_ENVIRONMENT is not set');
}

if (!process.env.ABSOLUTE_FILESIZE_LIMIT_TOKENS) {
  throw new Error('ABSOLUTE_FILESIZE_LIMIT_TOKENS is not set');
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to chunk text with optional overlap
function chunkText(text: string, maxTokens: number = 300, overlap: number = 50) {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxTokens, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);
    start += maxTokens - overlap;
  }

  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    try {
      // Convert file to text and truncate if needed
      const text = await file.text();
      if (text.length > Number(process.env.ABSOLUTE_FILESIZE_LIMIT_TOKENS)) {
        console.log("The file has exceeded the max limit of tokens: " + Number(process.env.ABSOLUTE_FILESIZE_LIMIT_TOKENS));
      }
      const truncatedText = text.slice(0, Number(process.env.ABSOLUTE_FILESIZE_LIMIT_TOKENS));
    


      // Chunk the text into smaller pieces
      const chunks = chunkText(truncatedText);
      console.log(`Document split into ${chunks.length} chunks.`); // Log the number of chunks
      chunks.forEach((chunk, index) => {
        console.log(`Chunk ${index + 1}: ${chunk.slice(0, 50)}...`); // Log the first 50 characters of each chunk
      });

      // Initialize the index
      const indexName = process.env.PINECONE_INDEX_NAME;
      if (!indexName) throw new Error('PINECONE_INDEX_NAME is not set');
      const index = pinecone.index(indexName);

      const vectors = [];
      for (const [i, chunk] of chunks.entries()) {
        // Generate embeddings for each chunk
        const embedding = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: chunk,
        });

        const vector = {
          id: `doc_${Date.now()}_chunk_${i}`,
          values: embedding.data[0].embedding,
          metadata: {
            filename: file.name,
            chunkIndex: i,
            text: chunk,
            fullLength: text.length,
          },
        };

        vectors.push(vector);
      }

      // Upsert all vectors to Pinecone
      await index.upsert(vectors);
      console.log(`File "${file.name}" successfully chunked and stored in Pinecone database`);

    } catch (innerError: any) {
      console.error("Pinecone operation failed:", innerError);
      return NextResponse.json(
        { error: `Pinecone operation failed: ${innerError?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "File received and stored in Pinecone",
      filename: file.name,
    });

  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File upload failed" },
      { status: 500 }
    );
  }
}

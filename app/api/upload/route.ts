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

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      const truncatedText = text.slice(0, 20000);

      // Generate embeddings using OpenAI
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: truncatedText,
      });
      console.log(`File "${file.name}" successfully converted to vector embeddings`);

      // Initialize the index
      const indexName = process.env.PINECONE_INDEX_NAME;
      if (!indexName) throw new Error('PINECONE_INDEX_NAME is not set');
      const index = pinecone.index(indexName);

      const docId = `doc_${Date.now()}`;
      // Create a vector using the embeddings
      const vector = {
        id: docId,
        values: embedding.data[0].embedding,
        metadata: {
          filename: file.name,
          text: truncatedText,
          fullLength: text.length
        },
      };

      // Upsert the vector to Pinecone
      await index.upsert([vector]);
      console.log(`File "${file.name}" successfully stored in Pinecone database with ID: ${docId}`);
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
      filename: file.name
    });

  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File upload failed" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY is not set');
}

if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error('PINECONE_INDEX_NAME is not set');
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
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
      const truncatedText = text.slice(0, 20000); // Limit to first 20000 characters

      // Initialize the index
      const indexName = process.env.PINECONE_INDEX_NAME;
      if (!indexName) throw new Error('PINECONE_INDEX_NAME is not set');
      const index = pinecone.index(indexName);

      // Create a vector from the text
      const vector = {
        id: `doc_${Date.now()}`,
        values: Array.from({ length: 1024 }, () => Math.random()),
        metadata: {
          filename: file.name,
          text: truncatedText,
          fullLength: text.length // Store original length for reference
        },
      };

      // Upsert the vector to Pinecone
      await index.upsert([vector]);
      console.log(`File "${file.name}" successfully stored in Pinecone database with ID: doc_${Date.now()}`);
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
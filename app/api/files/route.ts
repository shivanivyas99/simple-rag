import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY as string,
});

export async function GET() {
  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME as string);
    
    // Fetch all vectors and extract unique filenames from metadata
    const queryResponse = await index.query({
      vector: new Array(1536).fill(0), // Dummy vector
      topK: 10000,
      includeMetadata: true
    });

    // Extract unique filenames from metadata
    const uniqueFiles = [...new Set(
      queryResponse.matches
        ?.map(match => match.metadata?.filename)
        .filter(Boolean) as string[]
    )];

    return NextResponse.json({ files: uniqueFiles });
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
} 
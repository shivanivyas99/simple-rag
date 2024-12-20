import { NextRequest, NextResponse } from 'next/server';

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

    // Here you can handle the file as needed
    // The file will be of type File (Web API)
    console.log("File received successfully!", file.name);
    
    return NextResponse.json({
      success: true,
      message: "File received successfully",
      filename: file.name
    });

  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: "File upload failed" },
      { status: 500 }
    );
  }
}

import { OpenAI } from "openai";
import pinecone from "pinecone-client";
import multer from "multer";
import fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
pinecone.init({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT,
});

const index = pinecone.Index("your-index-name");

// Configure Multer for file uploads
const upload = multer({ dest: "uploads/" });

export const config = {
  api: {
    bodyParser: false, // Disable body parsing for file uploads
  },
};

export default async function handler(req, res) {
  if (req.method === "POST") {
    upload.single("file")(req, {}, async (err) => {
      if (err) return res.status(500).json({ error: "File upload failed" });

      try {
        const filePath = req.file.path;
        const fileContent = await fs.readFile(filePath, "utf8");

        // Generate embedding for the file content
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: fileContent,
        });
        const embedding = embeddingResponse.data[0].embedding;

        // Store embedding in Pinecone
        const fileName = req.file.originalname || "uploaded_document";
        await index.upsert({
          upserts: [
            {
              id: fileName,
              values: embedding,
              metadata: { content: fileContent },
            },
          ],
        });

        // Clean up the uploaded file
        await fs.unlink(filePath);

        res.status(200).json({ success: true, message: "File uploaded and processed successfully" });
      } catch (error) {
        console.error("Error processing file:", error);
        res.status(500).json({ error: "File processing failed" });
      }
    });
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}

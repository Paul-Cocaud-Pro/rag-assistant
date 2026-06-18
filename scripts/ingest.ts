
import { extractText } from "unpdf";
import { readFile } from "fs/promises";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { readdirSync } from "fs";

dotenv.config({ path: ".env.local" });

const DOCUMENTS_DIR = "./documents";
const PDF_FILES = readdirSync(DOCUMENTS_DIR)
    .filter(f => f.endsWith(".pdf"))
    .map(f => `${DOCUMENTS_DIR}/${f}`);
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

function splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
    if (overlap >= chunkSize) throw new Error("overlap doit être inférieur à chunkSize");
    const chunks: string[] = [];
    let position = 0;
    while (position < text.length) {
        const chunk = text.slice(position, position + chunkSize);
        chunks.push(chunk);
        position += chunkSize - overlap;
    }
    return chunks;
}

async function ingest() {
  // 1. Charger le PDF
    let fullText = "";
    for (const pdfPath of PDF_FILES) {
        console.log(`📄 Traitement du fichier : ${pdfPath}`);
        const pdfBuffer = await readFile(pdfPath);
        const { text } = await extractText(new Uint8Array(pdfBuffer), { mergePages: true });
        fullText += text + "\n\n";
        console.log(`📄 ${pdfPath} chargé : ${text.length} caractères`);
    }
    console.log(`📚 Total : ${fullText.length} caractères extraits`);

  // 2. Découper en chunks
    const chunks = splitIntoChunks(fullText, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`✂️ Découpé en ${chunks.length} chunks`);
    
  // 3. Générer les embeddings par batch
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embeddings = [];
    const EMBEDDING_BATCH_SIZE = 10;

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const results = await Promise.all(
            batch.map((chunk) => openai.embeddings.create({
                model: "text-embedding-3-small",
                input: chunk,
                encoding_format: "float",
            }))
        );
        embeddings.push(...results);
        console.log(`🧮 Embeddings : ${embeddings.length}/${chunks.length}`);
        // Petite pause pour éviter le rate limit
        await new Promise(r => setTimeout(r, 6500));
    }

  // 4. Stocker dans Supabase par batch
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const BATCH_SIZE = 10;  
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + BATCH_SIZE);
        const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from("documents").insert(
            batchChunks.map((chunk, index) => ({
                content: chunk,
                metadata: { source: DOCUMENTS_DIR },
                embedding: batchEmbeddings[index].data[0].embedding, 
            }))
        );
        if (error) {
            console.error("Erreur lors de l'insertion dans Supabase :", error);
            return;
        }
        console.log(`💾 Batch ${i / BATCH_SIZE + 1} inséré avec succès`);
    }
    console.log(`✅ Ingestion terminée ! ${chunks.length} chunks stockés.`);
}

ingest().catch(console.error);
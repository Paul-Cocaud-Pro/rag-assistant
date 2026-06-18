import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";


export async function POST(req: Request) {
  // 1. Récupérer les messages de la requête
    const body = await req.json();
    console.log("Body reçu:", JSON.stringify(body, null, 2));
    const { messages } = body;
    const lastMessage = messages[messages.length - 1].parts
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join(" ");


  // 2. Transformer la dernière question en vecteur
    const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embedding = await openaiClient.embeddings.create({
        model: "text-embedding-3-small",
        input: lastMessage,
        encoding_format: "float",
    });
    const queryVector = embedding.data[0].embedding;

    
  // 3. Chercher les chunks pertinents dans pgvector
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: chunks, error } = await supabase.rpc("match_documents", {
        query_embedding: queryVector,
        match_count: 4,          // récupérer les 4 chunks les plus pertinents
        match_threshold: 0.5,    // ignorer les chunks trop éloignés sémantiquement
    });
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

  // 4. Construire le prompt système avec le contexte
    const context = chunks?.map((c: { content: string }) => c.content).join("\n\n") ?? "Aucun document pertinent trouvé.";

    const systemPrompt = `Tu es un assistant spécialisé en astronomie. 
    Tu réponds aux questions en te basant UNIQUEMENT sur le contexte de documents fourni ci-dessous.
    Si la réponse ne se trouve pas dans le contexte, dis clairement : "Je ne trouve pas cette information dans les documents disponibles."
    Ne jamais inventer d'information qui n'est pas dans le contexte.

    CONTEXTE :
    ${context}`;

  // 5. Appeler le LLM avec streaming
    const formattedMessages = messages.map((m: { role: string; parts: { type: string; text: string }[] }) => ({
        role: m.role,
        content: m.parts
            .filter(p => p.type === "text")
            .map(p => p.text)
            .join(" "),
    }));
    console.log("Chunks trouvés:", chunks?.length ?? 0);
    console.log("Contexte (200 premiers caractères):", context.slice(0, 200));
    console.log("Messages formatés:", JSON.stringify(formattedMessages, null, 2));

    const result = streamText({
        model: openai("gpt-4o-mini"),
        system: systemPrompt,
        messages: formattedMessages,
    });

    return result.toTextStreamResponse();
}

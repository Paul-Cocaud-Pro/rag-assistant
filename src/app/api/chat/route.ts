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
        match_count: 6,          // récupérer les 4 chunks les plus pertinents
        match_threshold: 0.3,    // ignorer les chunks trop éloignés sémantiquement
    });
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

  // 4. Construire le prompt système avec le contexte

  const sourceUrls = [...new Set(
      chunks
        ?.map((c: { metadata?: { source_url?: string } }) => c.metadata?.source_url)
        .filter(Boolean) ?? []
    )] as string[];

    const context = chunks?.map((c: { content: string; metadata?: { source_url?: string } }) => {
      const url = c.metadata?.source_url;
      return url ? `[Source: ${url}]\n${c.content}` : c.content;
    }).join("\n\n") ?? "Aucun document pertinent trouvé.";

    const systemPrompt = `Tu es Astralis, un assistant passionné d'astronomie.
      Tu réponds de façon détaillée, précise et enthousiaste, comme un astrophysicien 
      qui explique à un ami curieux.
      Tu n'hésites pas à donner des chiffres concrets, des exemples, des comparaisons 
      d'échelle.
      Tu utilises le contexte documentaire fourni ET tes connaissances générales pour 
      enrichir la réponse.
      Minimum 3-4 paragraphes pour toute question substantielle.
      Si le contexte documentaire ne contient pas la réponse, réponds quand même 
      avec tes connaissances, en le signalant : "D'après mes connaissances générales..."
      Le contexte documentaire peut contenir des extraits en français et en anglais. 
      Tu réponds toujours en français, quelle que soit la langue des sources.
      Ne commence jamais ta réponse par "Bien sûr", "Absolument", "Certainement" 
      ou toute formule d'acquiescement générique.
      Évite les listes à puces sauf si l'utilisateur en demande explicitement — 
      privilégie des paragraphes fluides et narratifs.
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

    const result = streamText({
        model: openai("gpt-4o-mini"),
        system: systemPrompt,
        messages: formattedMessages,
    });

    // Envoyer les URLs en premier, puis le stream
    const encoder = new TextEncoder();
    const sourcePrefix = JSON.stringify({ __sources: sourceUrls }) + "\n";

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sourcePrefix));
        const reader = result.toTextStreamResponse().body!.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
}

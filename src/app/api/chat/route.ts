import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";


export async function POST(req: Request) {
  // 1. Récupérer les messages de la requête
    const body = await req.json();
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
        match_count: 6,          // récupérer les 6 chunks les plus pertinents
        match_threshold: 0.45,    // ignorer les chunks trop éloignés sémantiquement
    });
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    const hasChunks = chunks && chunks.length > 0;

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

    const systemPrompt = hasChunks? 
      `Tu es Astralis, un assistant passionné d'astronomie et d'astrophysique.

      Réponds à la question en t'appuyant UNIQUEMENT sur les passages fournis ci-dessous. N'utilise pas tes connaissances propres : si un fait n'y figure pas, ne l'invente pas. Si les passages ne répondent pas réellement à la question posée, dis-le clairement plutôt que de forcer une réponse approximative.

      Commence impérativement ta réponse par « D'après ma base documentaire, ».

      Réponds de façon détaillée et enthousiaste, comme un astrophysicien qui explique à un ami curieux : chiffres concrets, exemples, comparaisons d'échelle. Minimum 3 à 4 paragraphes. Évite les listes à puces, privilégie des paragraphes fluides. Hormis le préfixe imposé, ne commence jamais par "Bien sûr", "Absolument" ou toute formule d'acquiescement. Les passages peuvent être en français ou en anglais ; réponds toujours en français.

      CONTEXTE :
      ${context}` : 
      `Tu es Astralis, un assistant passionné d'astronomie et d'astrophysique.

      Ta base documentaire ne contient aucun passage pertinent sur le sujet de cette question. Procède en deux temps :

      1. Si la question ne concerne PAS l'astronomie ou l'astrophysique, refuse poliment d'y répondre et invite l'utilisateur à poser une question sur l'astronomie. Ne réponds pas à la question elle-même.

      2. Si la question concerne bien l'astronomie ou l'astrophysique, réponds à partir de tes connaissances générales, de façon détaillée et enthousiaste, minimum 3 à 4 paragraphes, sans listes à puces. Commence impérativement ta réponse par « À titre général, hors de ma base documentaire, ».

      Réponds toujours en français.`;

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

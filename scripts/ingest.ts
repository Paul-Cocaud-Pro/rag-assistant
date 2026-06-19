
import { extractText } from "unpdf";
import { readFile } from "fs/promises";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { readdirSync } from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

const DOCUMENTS_DIR = "./documents";
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

// ── Mapping nom de fichier → URL source ───────────────────────────────────────
const SOURCE_URLS: Record<string, string> = {
  "astronomy-2e_-_WEB.pdf":                    "https://assets.openstax.org/oscms-prodcms/media/documents/astronomy-2e_-_WEB.pdf",
  "Amas_globulaire.pdf":                        "https://fr.wikipedia.org/wiki/Amas_globulaire",
  "Amas_ouvert.pdf":                            "https://fr.wikipedia.org/wiki/Amas_ouvert",
  "Année-lumière.pdf":                          "https://fr.wikipedia.org/wiki/Ann%C3%A9e-lumi%C3%A8re",
  "Big_Bang.pdf":                               "https://fr.wikipedia.org/wiki/Big_Bang",
  "Blazar.pdf":                                 "https://fr.wikipedia.org/wiki/Blazar",
  "Céphéide.pdf":                               "https://fr.wikipedia.org/wiki/C%C3%A9ph%C3%A9ide",
  "Constante_de_Hubble.pdf":                    "https://fr.wikipedia.org/wiki/Constante_de_Hubble",
  "Constellation.pdf":                          "https://fr.wikipedia.org/wiki/Constellation",
  "Cygnus_X-1.pdf":                             "https://fr.wikipedia.org/wiki/Cygnus_X-1",
  "Disque_d'accrétion.pdf":                     "https://fr.wikipedia.org/wiki/Disque_d%27accr%C3%A9tion",
  "Encelade_(lune).pdf":                        "https://fr.wikipedia.org/wiki/Encelade_(lune_de_Saturne)",
  "Énergie_sombre.pdf":                         "https://fr.wikipedia.org/wiki/%C3%89nergie_noire",
  "Espace_(cosmologie).pdf":                    "https://fr.wikipedia.org/wiki/Espace_(cosmologie)",
  "Étoile_à_neutrons.pdf":                      "https://fr.wikipedia.org/wiki/%C3%89toile_%C3%A0_neutrons",
  "Étoile_de_population_I.pdf":                 "https://fr.wikipedia.org/wiki/%C3%89toile_de_population_I",
  "Étoile_de_population_II.pdf":                "https://fr.wikipedia.org/wiki/%C3%89toile_de_population_II",
  "Étoile_de_population_III.pdf":               "https://fr.wikipedia.org/wiki/%C3%89toile_de_population_III",
  "Étoile_variable.pdf":                        "https://fr.wikipedia.org/wiki/%C3%89toile_variable",
  "Étoile.pdf":                                 "https://fr.wikipedia.org/wiki/%C3%89toile",
  "Europe_(lune).pdf":                          "https://fr.wikipedia.org/wiki/Europe_(lune)",
  "Évaporation_des_trous_noirs.pdf":            "https://fr.wikipedia.org/wiki/%C3%89vaporation_des_trous_noirs",
  "Exoplanète.pdf":                             "https://fr.wikipedia.org/wiki/Exoplan%C3%A8te",
  "Fond_diffus_cosmologique.pdf":               "https://fr.wikipedia.org/wiki/Fond_diffus_cosmologique",
  "Galaxie.pdf":                                "https://fr.wikipedia.org/wiki/Galaxie",
  "Gliese_710.pdf":                             "https://fr.wikipedia.org/wiki/Gliese_710",
  "Inflation_cosmique.pdf":                     "https://fr.wikipedia.org/wiki/Inflation_cosmique",
  "Jupiter_(planète).pdf":                      "https://fr.wikipedia.org/wiki/Jupiter_(plan%C3%A8te)",
  "Lentille_gravitationnelle.pdf":              "https://fr.wikipedia.org/wiki/Lentille_gravitationnelle",
  "Magnétar.pdf":                               "https://fr.wikipedia.org/wiki/Magn%C3%A9tar",
  "Mars_(planète).pdf":                         "https://fr.wikipedia.org/wiki/Mars_(plan%C3%A8te)",
  "Matière_noire_froide.pdf":                   "https://fr.wikipedia.org/wiki/Mati%C3%A8re_noire_froide",
  "Matière_noire.pdf":                          "https://fr.wikipedia.org/wiki/Mati%C3%A8re_noire",
  "Mercure_(planète).pdf":                      "https://fr.wikipedia.org/wiki/Mercure_(plan%C3%A8te)",
  "Modèle_ΛCDM.pdf":                            "https://fr.wikipedia.org/wiki/Mod%C3%A8le_Lambda-CDM",
  "Naine_blanche.pdf":                          "https://fr.wikipedia.org/wiki/Naine_blanche",
  "Naine_brune.pdf":                            "https://fr.wikipedia.org/wiki/Naine_brune",
  "Naine_rouge.pdf":                            "https://fr.wikipedia.org/wiki/Naine_rouge",
  "Nébuleuse_planétaire.pdf":                   "https://fr.wikipedia.org/wiki/N%C3%A9buleuse_plan%C3%A9taire",
  "Nébuleuse.pdf":                              "https://fr.wikipedia.org/wiki/N%C3%A9buleuse",
  "Neptune_(planète).pdf":                      "https://fr.wikipedia.org/wiki/Neptune_(plan%C3%A8te)",
  "Nucléosynthèse_stellaire.pdf":               "https://fr.wikipedia.org/wiki/Nucl%C3%A9osynth%C3%A8se_stellaire",
  "Onde_gravitationnelle.pdf":                  "https://fr.wikipedia.org/wiki/Onde_gravitationnelle",
  "Paradoxe_de_l'information.pdf":              "https://fr.wikipedia.org/wiki/Paradoxe_de_l%27information",
  "Planète.pdf":                                "https://fr.wikipedia.org/wiki/Plan%C3%A8te",
  "Proxima_Centauri_b.pdf":                     "https://fr.wikipedia.org/wiki/Proxima_Centauri_b",
  "Pulsar.pdf":                                 "https://fr.wikipedia.org/wiki/Pulsar",
  "Quasar.pdf":                                 "https://fr.wikipedia.org/wiki/Quasar",
  "Sagittarius_A_.pdf":                         "https://fr.wikipedia.org/wiki/Sagittarius_A*",
  "Séquence_principale.pdf":                    "https://fr.wikipedia.org/wiki/S%C3%A9quence_principale",
  "Supernova.pdf":                              "https://fr.wikipedia.org/wiki/Supernova",
  "Système_solaire.pdf":                        "https://fr.wikipedia.org/wiki/Syst%C3%A8me_solaire",
  "Terre.pdf":                                  "https://fr.wikipedia.org/wiki/Terre",
  "TRAPPIST-1.pdf":                             "https://fr.wikipedia.org/wiki/TRAPPIST-1",
  "Trou_noir.pdf":                              "https://fr.wikipedia.org/wiki/Trou_noir",
  "Univers.pdf":                                "https://fr.wikipedia.org/wiki/Univers",
  "Uranus_(planète).pdf":                       "https://fr.wikipedia.org/wiki/Uranus_(plan%C3%A8te)",
  "Vénus_(planète).pdf":                        "https://fr.wikipedia.org/wiki/V%C3%A9nus_(plan%C3%A8te)",
  "Vie_extraterrestre.pdf":                     "https://fr.wikipedia.org/wiki/Vie_extraterrestre",
  "Voie_lactée.pdf":                            "https://fr.wikipedia.org/wiki/Voie_lact%C3%A9e",
  "Zone_habitable.pdf":                         "https://fr.wikipedia.org/wiki/Zone_habitable",
};
// ─────────────────────────────────────────────────────────────────────────────

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
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  const pdfFiles = readdirSync(DOCUMENTS_DIR)
    .filter(f => f.endsWith(".pdf"))
    .map(f => `${DOCUMENTS_DIR}/${f}`);

  for (const pdfPath of pdfFiles) {
    const fileName = path.basename(pdfPath);
    const sourceUrl = SOURCE_URLS[fileName] ?? null;

    console.log(`\n📄 Traitement : ${fileName}`);
    if (!sourceUrl) console.warn(`⚠️  Pas d'URL définie pour ${fileName}`);

    // 1. Extraire le texte
    const pdfBuffer = await readFile(pdfPath);
    const { text } = await extractText(new Uint8Array(pdfBuffer), { mergePages: true });
    console.log(`📄 ${text.length} caractères extraits`);

    // 2. Découper en chunks
    const chunks = splitIntoChunks(text, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`✂️  ${chunks.length} chunks`);

    // 3. Embeddings par batch
    const embeddings: Awaited<ReturnType<typeof openai.embeddings.create>>[] = [];
    const EMBEDDING_BATCH_SIZE = 10;

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(chunk => openai.embeddings.create({
          model: "text-embedding-3-small",
          input: chunk,
          encoding_format: "float",
        }))
      );
      embeddings.push(...results);
      console.log(`🧮 Embeddings : ${embeddings.length}/${chunks.length}`);
      await new Promise(r => setTimeout(r, 6500));
    }

    // 4. Insertion Supabase par batch
    const BATCH_SIZE = 10;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("documents").insert(
        batchChunks.map((chunk, index) => ({
          content: chunk,
          metadata: { source: fileName, source_url: sourceUrl },
          embedding: batchEmbeddings[index].data[0].embedding,
        }))
      );
      if (error) {
        console.error(`❌ Erreur Supabase pour ${fileName} :`, error);
        return;
      }
    }
    console.log(`✅ ${fileName} ingéré (${chunks.length} chunks)`);
  }

  console.log("\n🎉 Ingestion complète !");
}

ingest().catch(console.error);

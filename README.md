# Astralis ✦ — Assistant Astronomie RAG

Astralis est un assistant conversationnel spécialisé en astronomie, propulsé par une architecture RAG (Retrieval-Augmented Generation). Contrairement à un simple chatbot, Astralis ne répond pas depuis sa mémoire : il recherche d'abord les passages les plus pertinents dans une base documentaire de plus de 60 sources (Wikipedia FR, OpenStax Astronomy, articles scientifiques), puis génère une réponse précise et sourcée en s'appuyant sur ce contexte. Le résultat : des réponses détaillées, enthousiastes et ancrées dans des documents vérifiables — avec les liens sources affichés en fin de réponse.

Sa particularité : Astralis distingue explicitement ce qui provient de son corpus documentaire de ce qui relève des connaissances générales du modèle, et refuse poliment les questions hors astronomie. Il assume de signaler quand une information n'est pas dans ses sources plutôt que d'inventer une réponse.

## Démo

<p align="center">
  <img src="public/demo.gif" alt="Démo Astralis" width="600" />
  <br />
</p>

🔭 **[Voir la démo live](https://astralis-taupe.vercel.app)**

---

## Stack technique

| Technologie | Rôle | Pourquoi ce choix |
|---|---|---|
| **Next.js 14** | Framework fullstack | App Router + API Routes dans un seul projet |
| **TypeScript** | Langage | Typage strict, indispensable sur un projet IA |
| **Supabase + pgvector** | Base vectorielle | PostgreSQL natif, pas de service externe supplémentaire |
| **OpenAI text-embedding-3-small** | Embeddings | Meilleur rapport qualité/coût, multilingue |
| **OpenAI gpt-4o-mini** | LLM | Rapide, peu coûteux, qualité suffisante pour la vulgarisation |
| **Vercel** | Déploiement | Intégration GitHub native, edge functions, zéro config Next.js |
| **unpdf** | Extraction PDF | Plus fiable que pdf-parse sur les gros documents |

---

## Comment ça marche

À chaque question, Astralis effectue une recherche vectorielle, puis **bascule dans l'un de deux modes** selon que le corpus contient ou non des passages pertinents.
 
**1. Embedding de la question**
La question de l'utilisateur est transformée en vecteur de 1536 dimensions via l'API OpenAI (`text-embedding-3-small`).
 
**2. Recherche vectorielle**
Ce vecteur est comparé par similarité cosinus aux près de 15 000 chunks stockés dans Supabase/pgvector via la fonction `match_documents`. Les 6 chunks les plus proches sémantiquement sont récupérés, à condition de dépasser un seuil de similarité de **0.45**. Ce seuil agit comme un filtre : il écarte les passages trop éloignés et sert d'aiguillage entre les deux modes.
 
**3a. Mode ancré — au moins un chunk pertinent**
Les chunks récupérés sont injectés dans le prompt système avec leurs URLs sources. Le modèle répond en **grounding strict** : il s'appuie uniquement sur ces passages, sans recourir à ses connaissances propres, et signale clairement si les passages ne couvrent pas la question. La réponse commence par **« D'après ma base documentaire, »** et les liens sources sont affichés en fin de réponse.
 
**3b. Mode replié — aucun chunk pertinent**
Quand aucun passage ne dépasse le seuil, deux cas se présentent. Si la question ne concerne pas l'astronomie ou l'astrophysique, Astralis **refuse poliment** et invite à reformuler. Si elle est bien astronomique mais absente du corpus, le modèle répond à partir de ses **connaissances générales**, en préfixant sa réponse par **« À titre général, hors de ma base documentaire, »** — et sans afficher de sources, puisque la réponse n'est pas ancrée dans le corpus.
 
**4. Génération streamée**
`gpt-4o-mini` génère la réponse en streaming via l'AI SDK de Vercel. Les URLs sources sont envoyées en préfixe du stream et n'apparaissent côté interface que pour les réponses réellement ancrées dans le corpus.

### Schéma du pipeline
```
Question utilisateur
        │
        ▼
[Embedding OpenAI]
        │
        ▼
[Recherche pgvector]
        │
        ▼
Au moins un chunk au-dessus du seuil (0.45) ?
        │
   ┌────┴──────────────┐
  OUI                 NON
   │                   │
   ▼                   ▼
[Grounding strict]   Question astronomique ?
   │               ┌───┴─────────┐
   │              OUI           NON
   │               │             │
   │               ▼             ▼
   │         [Connaissances  [Refus poli]
   │          générales]
   ▼               ▼             │
"D'après ma    "À titre        invitation
 base doc."     général…"      à reformuler
 + sources      sans source    sans source
   │               │             │
   └───────────────┴─────────────┘
                   ▼
         [GPT-4o-mini streaming]
                   ▼
                Réponse
```
---

## Choix de conception
 
**Traçabilité avant tout.** L'intérêt d'une architecture RAG n'est pas de « savoir plus » qu'un modèle généraliste, mais de fournir des réponses *vérifiables*. Astralis affiche les passages et liens sources sur lesquels il s'appuie, et distingue visuellement une réponse sourcée d'une réponse issue des connaissances générales du modèle.
 
**Honnêteté sur les limites.** Plutôt que d'halluciner une réponse confiante quand le corpus est muet, Astralis le signale explicitement. Un assistant qui dit « cette information n'est pas dans mes sources » est plus fiable qu'un assistant qui invente.
 
**Cadrage du domaine.** Le garde-fou hors-domaine s'appuie sur le corpus lui-même : comme la base ne contient que de l'astronomie, toute question étrangère au sujet ne remonte aucun passage et déclenche un refus poli — sans nécessiter de classifieur dédié.
 
---

## Installation locale

### Prérequis
- Node.js 18+
- Un projet Supabase avec pgvector activé
- Une clé API OpenAI

### Variables d'environnement

Crée un fichier `.env.local` à la racine :

```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### Lancer le projet

```bash
git clone https://github.com/Paul-Cocaud-Pro/rag-assistant
cd rag-assistant
npm install
npm run dev
```

### Ingestion des documents

Place tes PDFs dans le dossier `/documents` puis lance :

```bash
npx ts-node scripts/ingest.ts
```

L'ingestion traite chaque PDF séparément, génère les embeddings par batch de 10 et les stocke dans Supabase avec leur URL source.

---

## Structure du projet
```
├── documents/          # PDFs sources (non versionnés)

├── scripts/

│   └── ingest.ts       # Pipeline d'ingestion

├── src/

│   └── app/

│       ├── api/chat/

│       │   └── route.ts        # API RAG + streaming

│       ├── page.tsx            # Interface chat

│       ├── chat.module.css     # Styles

│       └── StarryBackground.tsx # Canvas étoilé animé

└── public/

└── logo.png
```
---

## Auteur

**Paul Cocaud** — Ingénieur Full-Stack & AI  
[LinkedIn](https://linkedin.com/in/paul-cocaud-340b03141) · [GitHub](https://github.com/Paul-Cocaud-Pro)
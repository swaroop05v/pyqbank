// Shared helpers for the Node scripts (setup, seed, tests)
import 'dotenv/config';
import path from 'node:path';
import pg from 'pg';
import { pipeline, env } from '@huggingface/transformers';

export function getClient() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  return new pg.Client({ connectionString: process.env.DATABASE_URL });
}

// Same model and settings as src/lib/embeddings.ts so vectors are comparable.
// The model (~23 MB) is downloaded once into .cache/models.
env.cacheDir = path.join(process.cwd(), '.cache', 'models');
if (process.env.EMBED_MODEL_DIR) {          // optional: use a model folder already on disk
  env.localModelPath = process.env.EMBED_MODEL_DIR;
  env.allowRemoteModels = false;
}
let extractor;

export async function embed(texts) {
  extractor ??= await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  return out.tolist();
}

export const toPgVector = (v) => `[${v.map((x) => x.toFixed(6)).join(',')}]`;

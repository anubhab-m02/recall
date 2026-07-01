// Clusters related MemoryEvents and synthesizes them into a Lesson (spec
// FR-15, §7.2). Only clusters events not already covered by an existing
// Lesson (so re-running this job doesn't produce duplicate Lessons for
// the same episode), and only clusters of at least MIN_CLUSTER_SIZE —
// a single isolated event isn't "an episode" worth synthesizing.

import { renderLessonSynthesisPrompt } from "@recall/prompt-templates";
import { ulid } from "ulid";
import type { Lesson, MemoryEvent } from "@recall/shared-types";
import type { EmbeddingProvider } from "../embeddings/provider.js";
import { safeGenerate } from "../generation/safeGenerate.js";
import type { GenerationProvider } from "../generation/provider.js";
import type { LanceDbStore } from "../storage/lancedb.js";
import { clusterEventsByTimeWindow } from "./clustering.js";

const DEFAULT_WINDOW_MS = 30 * 60 * 1000;
const DEFAULT_MIN_CLUSTER_SIZE = 3;
const SCHEMA_VERSION = 1;
const INITIAL_REV = 1;

export interface ClusterIntoLessonsDeps {
  lancedb: LanceDbStore;
  provider: GenerationProvider;
  embeddings: EmbeddingProvider;
}

export interface ClusterIntoLessonsOptions {
  windowMs?: number;
  minClusterSize?: number;
}

export async function clusterIntoLessons(
  tenantId: string,
  deps: ClusterIntoLessonsDeps,
  options: ClusterIntoLessonsOptions = {}
): Promise<Lesson[]> {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const minClusterSize = options.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE;

  const [events, existingLessons] = await Promise.all([
    deps.lancedb.scanEventsForSearch({ tenantId }),
    deps.lancedb.scanLessonsForTenant(tenantId)
  ]);

  const covered = new Set(existingLessons.flatMap((lesson) => lesson.sourceEventIds));
  const uncoveredEvents = events.filter((event) => !covered.has(event.id));

  const clusters = clusterEventsByTimeWindow(uncoveredEvents, windowMs).filter(
    (cluster) => cluster.length >= minClusterSize
  );

  const lessons: Lesson[] = [];
  for (const cluster of clusters) {
    const lesson = await synthesizeLesson(tenantId, cluster, deps.provider, deps.embeddings);
    await deps.lancedb.insertLesson(lesson);
    lessons.push(lesson);
  }
  return lessons;
}

function buildExtractiveLesson(cluster: MemoryEvent[]): { title: string; summary: string } {
  const first = cluster[0]!;
  return {
    title: first.embeddingText.slice(0, 80),
    summary: cluster.map((e) => e.embeddingText).join("; ")
  };
}

async function synthesizeLesson(
  tenantId: string,
  cluster: MemoryEvent[],
  provider: GenerationProvider,
  embeddings: EmbeddingProvider
): Promise<Lesson> {
  const prompt = renderLessonSynthesisPrompt(
    cluster.map((e) => ({ type: e.type, occurredAt: e.occurredAt, embeddingText: e.embeddingText }))
  );
  const raw = await safeGenerate(provider, prompt);

  let title: string;
  let summary: string;
  let whatWorked: string | undefined;
  let whatDidntWork: string | undefined;
  try {
    const parsed = JSON.parse(raw) as {
      title: string;
      summary: string;
      whatWorked?: string | null;
      whatDidntWork?: string | null;
    };
    if (!parsed.title || !parsed.summary) throw new Error("missing required fields");
    title = parsed.title;
    summary = parsed.summary;
    whatWorked = parsed.whatWorked ?? undefined;
    whatDidntWork = parsed.whatDidntWork ?? undefined;
  } catch {
    // The extractive fallback returns bullet lines, not JSON, and even a
    // real LLM can return malformed JSON — either way, build the Lesson
    // directly from the source events rather than failing the job.
    ({ title, summary } = buildExtractiveLesson(cluster));
  }

  const embeddingText = `${title} | ${summary}`;
  let embedding: number[];
  try {
    embedding = await embeddings.embed(embeddingText);
  } catch {
    embedding = new Array(embeddings.dimension).fill(0);
  }

  const now = new Date().toISOString();
  const repoRoot = cluster[0]?.project?.repoRoot;
  return {
    id: ulid(),
    schemaVersion: SCHEMA_VERSION,
    rev: INITIAL_REV,
    tenantId,
    title,
    summary,
    whatWorked,
    whatDidntWork,
    sourceEventIds: cluster.map((e) => e.id),
    tags: [...new Set(cluster.flatMap((e) => e.tags))],
    embedding,
    embeddingModel: embeddings.modelName,
    embeddingDim: embeddings.dimension,
    project: repoRoot ? { repoRoot } : undefined,
    createdAt: now,
    updatedAt: now,
    usefulnessScore: 0
  };
}

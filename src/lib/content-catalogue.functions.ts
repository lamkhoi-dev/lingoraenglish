/**
 * Shared "what's unlocked on my plan" catalogue — used by LockedContentList
 * across vocabulary/grammar/listening. Calls the original Postgres function
 * content_catalogue(_kind) as-is (same reasoning as
 * coach.functions.ts#getCoachTopicCatalogue: don't reimplement a tier-gated
 * UNION query in Drizzle when the exact-behavior original already exists).
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { withAnon, withUser } from "@/db";
import { getOptionalUserId } from "@/lib/require-auth";

export type CatalogueItem = {
  id: string;
  title: string;
  level: string;
  category: string;
  access_tier: string;
  unlocked: boolean;
};

const catalogueSchema = z.object({ kind: z.enum(["vocabulary", "grammar", "listening"]) });

/** Locked rows keep only what a lock card needs (level, category, tier) —
 * never the id or the title. For vocabulary the "title" IS the word itself,
 * so returning it for words 11+ of every topic handed a free learner the
 * whole locked word list by calling this directly (Yêu cầu 7: "từ thứ 11 bị
 * khóa và kiểm tra ở phía máy chủ"), and the ids were enough to pull their
 * translations. */
export const getContentCatalogue = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => catalogueSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) =>
      db.execute(sql`select * from content_catalogue(${data.kind})`);
    const rows = (userId ? await withUser(userId, query) : await withAnon(query)) as unknown as CatalogueItem[];
    return rows.map((row) => (row.unlocked ? row : { ...row, id: "", title: "" }));
  });

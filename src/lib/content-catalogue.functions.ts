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

export const getContentCatalogue = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => catalogueSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) =>
      db.execute(sql`select * from content_catalogue(${data.kind})`);
    const rows = userId ? await withUser(userId, query) : await withAnon(query);
    return rows as unknown as CatalogueItem[];
  });

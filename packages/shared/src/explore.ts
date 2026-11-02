import { z } from 'zod';
import { modelFormatSchema, modelListItemSchema } from './models.js';

export const exploreResponseSchema = z.object({
  trending: z.array(modelListItemSchema),
  trendingIsFallback: z.boolean(),
  newest: z.array(modelListItemSchema),
  mostStarred: z.array(modelListItemSchema),
});
export type ExploreResponse = z.infer<typeof exploreResponseSchema>;

export const exploreSortSchema = z.enum(['trending', 'stars', 'recent']);
export type ExploreSort = z.infer<typeof exploreSortSchema>;

export const exploreSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  format: modelFormatSchema.optional(),
  downloadable: z.enum(['true', 'false']).optional(),
  sort: exploreSortSchema.default('trending'),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

export const exploreSearchResponseSchema = z.object({
  items: z.array(modelListItemSchema),
  hasMore: z.boolean(),
});

export const profileSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  createdAt: z.string(),
  publicModelCount: z.number(),
  starsReceived: z.number(),
});
export type Profile = z.infer<typeof profileSchema>;

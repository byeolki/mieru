import { z } from 'zod';

export const HISTOGRAM_BINS = 64;

export const tensorListItemSchema = z.object({
  name: z.string(),
  dtype: z.string(),
  shape: z.array(z.number()),
  params: z.number(),
  bytes: z.number(),
});
export type TensorListItem = z.infer<typeof tensorListItemSchema>;

export const tensorListResponseSchema = z.object({ items: z.array(tensorListItemSchema) });

export const tensorStatsSchema = z.object({
  name: z.string(),
  dtype: z.string(),
  shape: z.array(z.number()),
  count: z.number(),
  min: z.number(),
  max: z.number(),
  mean: z.number(),
  std: z.number(),
  zeroFraction: z.number(),
  nonFinite: z.number(),
  /** True when a very large tensor was summarized from evenly spaced windows. */
  sampled: z.boolean(),
  histogram: z.object({ min: z.number(), max: z.number(), counts: z.array(z.number()) }),
});
export type TensorStats = z.infer<typeof tensorStatsSchema>;

export const tensorFiltersSchema = z.object({
  name: z.string(),
  /** `rgb` for first-layer kernels over 3 input channels, otherwise the mean over inputs. */
  mode: z.enum(['rgb', 'gray']),
  kernelHeight: z.number(),
  kernelWidth: z.number(),
  outChannels: z.number(),
  /** Per filter: kh*kw values (gray) or 3*kh*kw values in CHW order (rgb). */
  filters: z.array(z.array(z.number())),
  min: z.number(),
  max: z.number(),
});
export type TensorFilters = z.infer<typeof tensorFiltersSchema>;

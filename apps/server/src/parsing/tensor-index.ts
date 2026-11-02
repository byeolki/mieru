/** Where each weight tensor's bytes live in the file; kept server-side for weight statistics. */
export interface TensorIndexEntry {
  name: string;
  dtype: string;
  shape: number[];
  offset: number;
  length: number;
}

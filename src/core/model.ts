/** The core's only model dependency. Adapters own transport and credentials. */
export interface ModelRequest {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ModelClient {
  readonly id: string;
  generate(request: ModelRequest): Promise<unknown>;
}

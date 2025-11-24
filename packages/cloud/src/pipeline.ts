/**
 * Cloud Pipeline client for building and executing pipelines via api.chonkie.ai
 */

import { Chunk } from '@chonkiejs/core';
import { CloudBaseChunker, ChunkerInput } from '@/base';
import { FileReference } from '@/utils';

const SLUG_PATTERN = /^[a-z0-9_-]+$/;

export interface PipelineOptions {
  /** Unique identifier for the pipeline (lowercase letters, numbers, dashes, underscores) */
  slug: string;
  /** Optional description of the pipeline */
  description?: string;
  /** API key (reads from CHONKIE_API_KEY env var if not provided) */
  apiKey?: string;
  /** Base URL for API (default: "https://api.chonkie.ai") */
  baseUrl?: string;
}

export interface PipelineStep {
  /** Step type: 'process', 'chunk', or 'refine' */
  type: 'process' | 'chunk' | 'refine';
  /** Component name (e.g., 'recursive', 'overlap', 'embeddings') */
  component: string;
  /** Additional parameters for the component */
  [key: string]: unknown;
}

export interface PipelineValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Validation errors if invalid */
  errors: string[] | null;
}

interface ApiPipelineResponse {
  id: string;
  slug: string;
  description: string | null;
  organization_slug: string;
  steps: PipelineStep[];
  created_at: string;
  updated_at: string;
}

interface ApiPipelineListResponse {
  organization_slug: string;
  pipelines: ApiPipelineResponse[];
}

interface ApiChunkResponse {
  text: string;
  start_index: number;
  end_index: number;
  token_count: number;
  context?: string;
  embedding?: number[];
}

interface ApiExecuteResponse {
  chunks: ApiChunkResponse[];
}

interface ApiValidateResponse {
  valid: boolean;
  message: string;
  errors: string[] | null;
}

export class Pipeline extends CloudBaseChunker {
  private readonly _slug: string;
  private _description: string | null;
  private _steps: PipelineStep[];
  private _isSaved: boolean;
  private _id: string | null;
  private _createdAt: string | null;
  private _updatedAt: string | null;

  constructor(options: PipelineOptions) {
    const apiKey = options.apiKey || process.env.CHONKIE_API_KEY;
    if (!apiKey) {
      throw new Error('API key is required. Provide it in options.apiKey or set CHONKIE_API_KEY environment variable.');
    }

    if (!SLUG_PATTERN.test(options.slug)) {
      throw new Error(
        `Invalid slug '${options.slug}'. Slug must contain only lowercase letters, numbers, dashes, and underscores.`
      );
    }

    super({ apiKey, baseUrl: options.baseUrl });

    this._slug = options.slug;
    this._description = options.description || null;
    this._steps = [];
    this._isSaved = false;
    this._id = null;
    this._createdAt = null;
    this._updatedAt = null;
  }

  get slug(): string {
    return this._slug;
  }

  get description(): string | null {
    return this._description;
  }

  get steps(): PipelineStep[] {
    return [...this._steps];
  }

  get isSaved(): boolean {
    return this._isSaved;
  }

  /**
   * Fetch an existing pipeline from the cloud
   */
  static async get(slug: string, options: { apiKey?: string; baseUrl?: string } = {}): Promise<Pipeline> {
    const apiKey = options.apiKey || process.env.CHONKIE_API_KEY;
    if (!apiKey) {
      throw new Error('API key is required. Provide it in options.apiKey or set CHONKIE_API_KEY environment variable.');
    }

    const baseUrl = options.baseUrl || 'https://api.chonkie.ai';
    const response = await fetch(`${baseUrl}/v1/pipeline/${slug}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      throw new Error(`Pipeline '${slug}' not found.`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch pipeline: ${errorText}`);
    }

    const data = await response.json() as ApiPipelineResponse;

    const pipeline = new Pipeline({
      slug: data.slug,
      description: data.description || undefined,
      apiKey,
      baseUrl,
    });

    pipeline._isSaved = true;
    pipeline._id = data.id;
    pipeline._createdAt = data.created_at;
    pipeline._updatedAt = data.updated_at;
    pipeline._steps = data.steps;

    return pipeline;
  }

  /**
   * List all pipelines from the cloud
   */
  static async list(options: { apiKey?: string; baseUrl?: string } = {}): Promise<Pipeline[]> {
    const apiKey = options.apiKey || process.env.CHONKIE_API_KEY;
    if (!apiKey) {
      throw new Error('API key is required. Provide it in options.apiKey or set CHONKIE_API_KEY environment variable.');
    }

    const baseUrl = options.baseUrl || 'https://api.chonkie.ai';
    const response = await fetch(`${baseUrl}/v1/pipeline`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list pipelines: ${errorText}`);
    }

    const data = await response.json() as ApiPipelineListResponse;

    return data.pipelines.map(p => {
      const pipeline = new Pipeline({
        slug: p.slug,
        description: p.description || undefined,
        apiKey,
        baseUrl,
      });

      pipeline._isSaved = true;
      pipeline._id = p.id;
      pipeline._createdAt = p.created_at;
      pipeline._updatedAt = p.updated_at;
      pipeline._steps = p.steps;

      return pipeline;
    });
  }

  /**
   * Validate a pipeline configuration without saving
   */
  static async validate(
    steps: PipelineStep[],
    options: { apiKey?: string; baseUrl?: string } = {}
  ): Promise<PipelineValidationResult> {
    const apiKey = options.apiKey || process.env.CHONKIE_API_KEY;
    if (!apiKey) {
      throw new Error('API key is required. Provide it in options.apiKey or set CHONKIE_API_KEY environment variable.');
    }

    const baseUrl = options.baseUrl || 'https://api.chonkie.ai';
    const response = await fetch(`${baseUrl}/v1/pipeline/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ steps }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Validation request failed: ${errorText}`);
    }

    const data = await response.json() as ApiValidateResponse;
    return {
      valid: data.valid,
      errors: data.errors,
    };
  }

  /**
   * Add a chunking step to the pipeline
   */
  chunkWith(chunkerType: string, params: Record<string, unknown> = {}): this {
    this._steps.push({
      type: 'chunk',
      component: chunkerType,
      ...params,
    });
    return this;
  }

  /**
   * Add a refinement step to the pipeline
   */
  refineWith(refineryType: string, params: Record<string, unknown> = {}): this {
    this._steps.push({
      type: 'refine',
      component: refineryType,
      ...params,
    });
    return this;
  }

  /**
   * Add a processing step to the pipeline
   */
  processWith(processorType: string, params: Record<string, unknown> = {}): this {
    this._steps.push({
      type: 'process',
      component: processorType,
      ...params,
    });
    return this;
  }

  /**
   * Save the pipeline to the cloud (internal method called on first run)
   */
  private async save(): Promise<void> {
    if (this._steps.length === 0) {
      throw new Error('Cannot save pipeline with no steps.');
    }

    const data = await this.request<ApiPipelineResponse>('/v1/pipeline', {
      method: 'POST',
      body: {
        slug: this._slug,
        description: this._description,
        steps: this._steps,
      },
    });

    this._isSaved = true;
    this._id = data.id;
    this._createdAt = data.created_at;
    this._updatedAt = data.updated_at;
  }

  /**
   * Update the pipeline in the cloud
   */
  async update(options: { description?: string } = {}): Promise<this> {
    const payload: Record<string, unknown> = {};

    if (options.description !== undefined) {
      payload.description = options.description;
      this._description = options.description;
    }

    if (this._steps.length > 0) {
      payload.steps = this._steps;
    }

    if (Object.keys(payload).length === 0) {
      return this;
    }

    const data = await this.request<ApiPipelineResponse>(`/v1/pipeline/${this._slug}`, {
      method: 'PUT',
      body: payload,
    });

    this._isSaved = true;
    this._updatedAt = data.updated_at;

    return this;
  }

  /**
   * Delete the pipeline from the cloud
   */
  async delete(): Promise<void> {
    await this.request<{ message: string }>(`/v1/pipeline/${this._slug}`, {
      method: 'DELETE',
    });

    this._isSaved = false;
    this._id = null;
  }

  /**
   * Execute the pipeline on text or file input
   */
  async run(input: ChunkerInput): Promise<Chunk[]> {
    if (!input.text && !input.filepath && !input.file) {
      throw new Error('Either text, filepath, or file must be provided.');
    }

    // Save pipeline if not already saved
    if (!this._isSaved) {
      await this.save();
    }

    // Handle file upload if filepath provided
    let fileRef: FileReference | undefined = input.file;
    if (input.filepath) {
      fileRef = await this.uploadFile(input.filepath);
    }

    // Build payload
    const payload: Record<string, unknown> = {};
    if (fileRef) {
      payload.file = fileRef;
    } else if (input.text) {
      payload.text = input.text;
    }

    const data = await this.request<ApiExecuteResponse>(`/v1/pipeline/${this._slug}`, {
      method: 'POST',
      body: payload,
    });

    return data.chunks.map(chunk => new Chunk({
      text: chunk.text,
      startIndex: chunk.start_index,
      endIndex: chunk.end_index,
      tokenCount: chunk.token_count,
      embedding: chunk.embedding,
    }));
  }

  /**
   * Export pipeline configuration as array of step objects
   */
  toConfig(): PipelineStep[] {
    return [...this._steps];
  }

  /**
   * Get a human-readable description of the pipeline
   */
  describe(): string {
    if (this._steps.length === 0) {
      return 'Empty pipeline';
    }

    return this._steps
      .map(step => `${step.type}(${step.component})`)
      .join(' -> ');
  }

  /**
   * Reset the pipeline steps
   */
  reset(): this {
    this._steps = [];
    return this;
  }

  toString(): string {
    const savedStatus = this._isSaved ? 'saved' : 'not saved';
    return `Pipeline(slug='${this._slug}', ${savedStatus}, ${this.describe()})`;
  }
}

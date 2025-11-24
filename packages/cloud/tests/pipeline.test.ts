import { Pipeline, PipelineStep } from '../src';

const TEST_SLUG = `test-pipeline-${Date.now().toString(36)}`;
const BASE_URL = process.env.CHONKIE_BASE_URL || 'https://api.chonkie.ai';

describe.skipIf(!process.env.CHONKIE_API_KEY)('Pipeline', () => {
  // Clean up after all tests
  afterAll(async () => {
    try {
      const pipeline = await Pipeline.get(TEST_SLUG, { baseUrl: BASE_URL });
      await pipeline.delete();
    } catch {
      // Pipeline may not exist, ignore
    }
  });

  it('should create a pipeline and run it', async () => {
    const pipeline = new Pipeline({
      slug: TEST_SLUG,
      description: 'Test pipeline for unit tests',
      baseUrl: BASE_URL,
    });

    pipeline
      .chunkWith('recursive', { chunk_size: 256 })
      .refineWith('overlap', { context_size: 32 });

    expect(pipeline.slug).toBe(TEST_SLUG);
    expect(pipeline.isSaved).toBe(false);

    // Run pipeline (auto-saves)
    const chunks = await pipeline.run({
      text: 'This is a test document. It contains multiple sentences for chunking.',
    });

    expect(pipeline.isSaved).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty('text');
    expect(chunks[0]).toHaveProperty('tokenCount');
  });

  it('should fetch an existing pipeline', async () => {
    const pipeline = await Pipeline.get(TEST_SLUG, { baseUrl: BASE_URL });

    expect(pipeline.slug).toBe(TEST_SLUG);
    expect(pipeline.isSaved).toBe(true);
    expect(pipeline.steps.length).toBeGreaterThan(0);
  });

  it('should list pipelines', async () => {
    const pipelines = await Pipeline.list({ baseUrl: BASE_URL });

    expect(Array.isArray(pipelines)).toBe(true);

    // Should include our test pipeline
    const found = pipelines.find(p => p.slug === TEST_SLUG);
    expect(found).toBeDefined();
  });

  it('should update a pipeline', async () => {
    const pipeline = await Pipeline.get(TEST_SLUG, { baseUrl: BASE_URL });

    // Modify steps
    pipeline.reset().chunkWith('sentence', { chunk_size: 128 });

    await pipeline.update({ description: 'Updated description' });

    expect(pipeline.description).toBe('Updated description');
  });

  it('should validate pipeline configuration', async () => {
    const validSteps: PipelineStep[] = [
      { type: 'chunk', component: 'recursive', chunk_size: 256 },
    ];

    const result = await Pipeline.validate(validSteps, { baseUrl: BASE_URL });

    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('should reject invalid slug format', () => {
    expect(() => {
      new Pipeline({ slug: 'Invalid Slug!' });
    }).toThrow(/Invalid slug/);
  });

  it('should describe pipeline steps', () => {
    const pipeline = new Pipeline({ slug: 'desc-test' });

    expect(pipeline.describe()).toBe('Empty pipeline');

    pipeline
      .chunkWith('recursive')
      .refineWith('overlap');

    expect(pipeline.describe()).toBe('chunk(recursive) -> refine(overlap)');
  });

  it('should export configuration', () => {
    const pipeline = new Pipeline({ slug: 'config-test' });

    pipeline
      .chunkWith('token', { chunk_size: 512 })
      .refineWith('embeddings', { embedding_model: 'test-model' });

    const config = pipeline.toConfig();

    expect(config).toHaveLength(2);
    expect(config[0]).toEqual({
      type: 'chunk',
      component: 'token',
      chunk_size: 512,
    });
    expect(config[1]).toEqual({
      type: 'refine',
      component: 'embeddings',
      embedding_model: 'test-model',
    });
  });

  it('should delete a pipeline', async () => {
    // Create a temporary pipeline
    const tempSlug = `temp-${Date.now().toString(36)}`;
    const pipeline = new Pipeline({
      slug: tempSlug,
      description: 'Temporary pipeline',
      baseUrl: BASE_URL,
    });

    pipeline.chunkWith('token', { chunk_size: 256 });
    await pipeline.run({ text: 'Test' });

    expect(pipeline.isSaved).toBe(true);

    await pipeline.delete();

    expect(pipeline.isSaved).toBe(false);

    // Verify it's actually deleted
    await expect(Pipeline.get(tempSlug, { baseUrl: BASE_URL })).rejects.toThrow(/not found/);
  });
});

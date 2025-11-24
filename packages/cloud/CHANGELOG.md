# @chonkiejs/cloud

## 0.1.0

### Minor Changes

- Add Pipeline client for building and executing pipelines via api.chonkie.ai

  - New `Pipeline` class with fluent API for building pipelines
  - Support for `chunkWith()`, `refineWith()`, and `processWith()` builder methods
  - Static methods: `Pipeline.get()`, `Pipeline.list()`, `Pipeline.validate()`
  - Instance methods: `run()`, `update()`, `delete()`, `reset()`
  - Auto-save on first `run()` call
  - File upload support via `filepath` option
  - Full TypeScript types: `PipelineOptions`, `PipelineStep`, `PipelineValidationResult`

## 0.0.6

### Patch Changes

- Fix: Add proper `.js` extension to the files

## 0.0.5

### Patch Changes

- Fix: Add `embedding` to the `Chunk` for `EmbeddingsRefinery`
- Updated dependencies
  - @chonkiejs/core@0.0.4

## 0.0.4

### Patch Changes

- Add OverlapRefinery and EmbeddingsRefinery

## 0.0.3

### Patch Changes

- Updated dependencies
  - @chonkiejs/core@0.0.3

## 0.0.2

### Patch Changes

- Fix: tsx alias not present error

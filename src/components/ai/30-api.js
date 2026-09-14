/* ============================================================================
 * Assemble the public Orion.ai namespace.
 * ========================================================================== */
O.ai = {
  configure: aiConfigure,
  chat: aiChat,
  stream: aiStream,
  complete: aiComplete,
  tasks: aiTasks,
  markdown: renderMarkdown,
  http: httpAdapter,
  openAICompatible: openAICompatibleAdapter,
  anthropic: anthropicAdapter,
  mock: mockAdapter,
  sseEvents,
  ndjsonEvents,
  get provider() { return __provider; },
};

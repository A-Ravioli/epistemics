/** Type shims for untyped optional entry points. */
declare module 'mammoth/mammoth.browser' {
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: Record<string, unknown>): Promise<{ value: string; messages: unknown[] }>;
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  };
  export = mammoth;
}

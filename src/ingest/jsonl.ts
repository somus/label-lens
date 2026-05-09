export async function* streamJsonl(
  filePath: string,
): AsyncGenerator<{ line: number; raw: string; value: unknown }> {
  const file = Bun.file(filePath);
  const stream = file.stream();
  const decoder = new TextDecoder();
  let buffer = "";
  let lineNumber = 0;

  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const raw = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      lineNumber++;
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        yield { line: lineNumber, raw, value: JSON.parse(trimmed) };
      }
      newlineIdx = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  const trimmed = buffer.trim();
  if (trimmed.length > 0) {
    lineNumber++;
    yield { line: lineNumber, raw: buffer, value: JSON.parse(trimmed) };
  }
}

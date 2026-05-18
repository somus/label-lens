/**
 * Strip C0 control chars (NUL through 0x1f) and DEL (0x7f) from a pasted
 * string. Tab (0x09) is kept so auth fields can accept tabbed input. Newlines
 * are collapsed to a single space upstream by callers that don't want
 * multi-line clipboard contents widening the field.
 *
 * Shared between the configure-assistant auth step (API keys / Ollama URLs
 * can contain colons, slashes, dots, etc.) and the relabel picker filter so
 * both surfaces treat pasted bytes the same way.
 */
export function keepPrintableInputChars(text: string): string {
  return text
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      if (code === 0x09) return true;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
}

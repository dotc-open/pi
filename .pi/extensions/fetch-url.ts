/**
 * Fetch URL Extension
 *
 * Registers a custom tool `fetch_url` that the LLM can call to retrieve
 * the contents of a URL (HTML, JSON, plain text, etc.).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// Cap the body returned to the LLM to avoid flooding the context window.
const MAX_BODY_CHARS = 100_000;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "fetch_url",
    label: "Fetch URL",
    description:
      "Retrieve the contents of a URL. Returns the response body as text, plus the status code and content type as details. Throws on non-2xx responses. Responses longer than 100,000 characters are truncated.",
    promptSnippet: "Fetch the contents of a URL",
    promptGuidelines: [
      "Use fetch_url to retrieve the contents of a web page, API endpoint, or raw file when you need the current content of a URL.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const response = await fetch(params.url, { signal: ctx.signal });

      if (!response.ok) {
        throw new Error(`fetch_url failed: ${response.status} ${response.statusText} for ${params.url}`);
      }

      const body = await response.text();
      const truncated = body.length > MAX_BODY_CHARS;
      const text = truncated ? body.slice(0, MAX_BODY_CHARS) : body;
      const suffix = truncated
        ? `\n\n[truncated: showing first ${MAX_BODY_CHARS} of ${body.length} characters]`
        : "";

      return {
        content: [{ type: "text", text: text + suffix }],
        details: {
          url: params.url,
          status: response.status,
          contentType: response.headers.get("content-type"),
          charCount: body.length,
          truncated,
        },
      };
    },
  });
}
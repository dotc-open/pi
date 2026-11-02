# @dotc/pi-platform-ai-provider

Pi extension providing integration with Platform AI.

## Features

- Registers the `platform-ai` provider (`PlatformAI`) with Pi using the `openai-completions` API format.
- Automatically attaches LiteLLM session tracking headers (`x-litellm-session-id`) for requests routed through the provider.
- Resolves the API key per request from a named key that can be switched in-session, so several accounts can be configured at once.

## Setup

### Environment Variables

`PLATFORM_AI_API_KEY` defines the key named `default`, and every `PLATFORM_AI_API_KEY_<NAME>` defines another named key. The name is the suffix lowercased with `_` replaced by `-`:

```bash
PLATFORM_AI_API_KEY=...           # name: default
PLATFORM_AI_API_KEY_PERSONAL=...  # name: personal
PLATFORM_AI_API_KEY_PROJECT_A=... # name: project-a
```

### Switching Keys

A session starts on the key named by `platformAiApiKey`, read from `.pi/settings.json` in the working directory, then `<agent-dir>/settings.json` (default `~/.pi/agent`, override the directory with `PI_CODING_AGENT_DIR`). Without either, the session starts on `default`:

```json
{
  "platformAiApiKey": "project-a"
}
```

Use the commands to see or change the active key:

- `/platform-ai-api-key` lists the discovered names and switches to the one you pick.
- `/platform-ai-api-key personal` switches directly, for use without a picker.
- `/which-platform-ai-api-key` shows the active key name.

A switch applies to subsequent requests and lasts for the session; it is not written to settings. If the active or configured name has no matching environment variable, the extension falls back to `default` and says so. Only key names are ever shown — key values are never logged, stored, or written to a session.

### Models

Add PlatformAI's models (see PlatformAI's docs) to your `models.json` (`~/.pi/agent/models.json`). An example:

```json
{
  "providers": {
    "platform-ai": {
      "models": [
        {
          "id": "bedrock.claude-sonnet-4-6",
          "name": "Sonnet 4.6",
          "reasoning": true,
          "input": ["text", "image"],
          "thinkingLevelMap": {
            "off": "none",
            "minimal": null,
            "low": "low",
            "medium": "medium",
            "high": "high",
            "xhigh": null,
            "max": "max"
          },
          "cost": {
            "input": 2,
            "output": 10,
            "cacheRead": 0.2,
            "cacheWrite": 4
          },
          "contextWindow": 1000000,
          "maxTokens": 64000
        }
      ]
    }
  }
}
```

## Installation

Install from npm:

```bash
pi install npm:@dotc/pi-platform-ai-provider
```

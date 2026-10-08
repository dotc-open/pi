# @dotc/pi-platform-ai-provider

Pi extension providing integration with Platform AI.

## Features

- Registers the `platform-ai` provider (`PlatformAI`) with Pi using the `openai-completions` API format.
- Automatically attaches LiteLLM session tracking headers (`x-litellm-session-id`) for requests routed through the provider.

## Setup

### Environment Variables

You must have the following environment variables defined:

- `PLATFORM_AI_API_KEY`: API key used for authentication with Platform AI.

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

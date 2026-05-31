# coderev — AI Code Review Agent

**coderev** is an AI-powered command-line code review tool. It analyzes git diffs and provides structured feedback — issues, suggestions, score, and praise — using large language models (OpenAI / DeepSeek).

## Quick Start

```bash
# Install globally
npm install -g coderev

# Create a config
coderev init

# Set your API key
export OPENAI_API_KEY="sk-..."

# Review a diff from a file
coderev review --file my-changes.diff

# Review from git
coderev review --repo . --base main --head feature

# Pipe a diff
git diff main | coderev review

# JSON output
coderev review --file changes.diff --output json
```

## Configuration

Run `coderev init` to generate a `.coderevrc.json` in your project root.

```json
{
  "ai": {
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.3,
    "maxTokens": 4096
  },
  "rules": {
    "maxLineLength": 100,
    "checkSecurity": true,
    "checkPerformance": true
  }
}
```

## Output Formats

- **terminal** – Colorful human-readable output (default)
- **json** – Machine-readable JSON
- **markdown** – Markdown report (useful for PR comments)

## Supported AI Providers

- **OpenAI** (`gpt-4o`, `gpt-4o-mini`, etc.)
- **DeepSeek** (`deepseek-chat`)

Set `OPENAI_API_KEY` or configure a different env var in config.

## License

MIT

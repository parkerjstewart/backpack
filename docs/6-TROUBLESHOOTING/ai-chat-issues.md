# AI & Chat Issues - Model Configuration & Quality

Problems with AI models, chat, and response quality.

---

## "Invalid API key" or "Unauthorized"

**Symptom:** Error when trying to chat: "Invalid API key"

**Cause:** Missing, invalid, or expired API key

**Solutions:**

### Solution 1: Add or Verify API Key
```bash
# Check .env has your API key:
cat .env | grep -i "OPENAI\|ANTHROPIC\|GOOGLE"

# Should see something like:
# OPENAI_API_KEY=sk-proj-...

# If missing, add it:
OPENAI_API_KEY=sk-proj-your-key-here

# Save and restart:
docker compose restart api

# Wait 10 seconds, then refresh browser
```

### Solution 2: Check Key is Valid
```bash
# Test API key directly:
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-proj-..."

# Should return list of models
# If error: key is invalid
```

### Solution 3: Verify Key Format
```bash
# OpenAI: Should start with sk-proj-
# Anthropic: Should start with sk-ant-
# Google: Should be AIzaSy...

# Check in .env:
cat .env | grep OPENAI_API_KEY
```

### Solution 4: Get Fresh Key
```bash
# Go to provider's dashboard:
# - OpenAI: https://platform.openai.com/api-keys
# - Anthropic: https://console.anthropic.com/
# - Google: https://aistudio.google.com/app/apikey

# Generate new key
# Copy exactly (no extra spaces)
```

### Solution 5: Update .env and Restart
```bash
# Edit .env:
OPENAI_API_KEY=sk-proj-new-key-here
# No quotes needed, no spaces

# Save and restart:
docker compose restart api
```

---

## Chat Returns Generic/Bad Responses

**Symptom:** AI responses are shallow, generic, or wrong

**Cause:** Bad context, vague question, or wrong model

**Solutions:**

### Solution 1: Check Context
```
1. In Chat, click "Select Sources"
2. Verify sources you want are CHECKED
3. Set them to "Full Content" (not "Summary Only")
4. Click "Save"
5. Try chat again
```

### Solution 2: Ask Better Question
```
Bad:     "What do you think?"
Good:    "Based on the paper's methodology, what are 3 limitations?"

Bad:     "Tell me about X"
Good:    "Summarize X in 3 bullet points with page citations"
```

### Solution 3: Use Stronger Model

Change model in your `.env` file:

```bash
# OpenAI - use gpt-4o instead of gpt-4o-mini:
DEFAULT_CHAT_MODEL=openai/gpt-4o

# Anthropic - use sonnet instead of haiku:
DEFAULT_CHAT_MODEL=anthropic/claude-sonnet-4-20250514

# Restart after changing:
docker compose restart api
```

### Solution 4: Add More Sources
```
If:  "Response seems incomplete"
Try: Add more relevant sources to provide context
```

---

## Chat is Very Slow

**Symptom:** Chat responses take minutes

**Cause:** Large context, slow model, or overloaded API

**Solutions:**

### Solution 1: Use Faster Model

Change `DEFAULT_CHAT_MODEL` in your `.env` file:

```bash
# Fastest: Groq
DEFAULT_CHAT_MODEL=groq/llama-3.1-70b-versatile

# Fast: OpenAI gpt-4o-mini
DEFAULT_CHAT_MODEL=openai/gpt-4o-mini

# Medium: Anthropic haiku
DEFAULT_CHAT_MODEL=anthropic/claude-3-5-haiku-20241022

# After changing, restart:
docker compose restart api
```

### Solution 2: Reduce Context
```
1. Chat → Select Sources
2. Uncheck sources you don't need
3. Or switch to "Summary Only" for background sources
4. Save and try again
```

### Solution 3: Increase Timeout
```bash
# In .env:
API_CLIENT_TIMEOUT=600  # 10 minutes

# Restart:
docker compose restart
```

### Solution 4: Check System Load
```bash
# See if API is overloaded:
docker stats

# If CPU >80% or memory >90%:
# Reduce: SURREAL_COMMANDS_MAX_TASKS=2
# Restart: docker compose restart
```

---

## Chat Doesn't Remember History

**Symptom:** Each message treated as separate, no context between questions

**Cause:** Chat history not saved or new chat started

**Solution:**

```
1. Make sure you're in same Chat (not new Chat)
2. Check Chat title at top
3. If it's blank, start new Chat with a title
4. Each named Chat keeps its history
5. If you start new Chat, history is separate
```

---

## "Rate limit exceeded"

**Symptom:** Error: "Rate limit exceeded" or "Too many requests"

**Cause:** Hit provider's API rate limit

**Solutions:**

### For Cloud Providers (OpenAI, Anthropic, etc.)

**Immediate:**
- Wait 1-2 minutes
- Try again

**Short term:**
- Use cheaper/smaller model
- Reduce concurrent operations
- Space out requests

**Long term:**
- Upgrade your account
- Switch to different provider
- Use Ollama (local, no limits)

### Check Account Status
```
OpenAI: https://platform.openai.com/account/usage/overview
Anthropic: https://console.anthropic.com/account/billing/overview
Google: Google Cloud Console
```

### For Ollama (Local)
- No rate limits
- Use `ollama pull mistral` for best model
- Restart if hitting resource limits

---

## "Context length exceeded" or "Token limit"

**Symptom:** Error about too many tokens

**Cause:** Sources too large for model

**Solutions:**

### Solution 1: Use Model with Longer Context

Change `LARGE_CONTEXT_MODEL` in your `.env` file:

```bash
# Claude has 200K context (auto-used for large content >105k tokens)
LARGE_CONTEXT_MODEL=anthropic/claude-sonnet-4-20250514

# Or Gemini has 1M+ context
LARGE_CONTEXT_MODEL=google/gemini-1.5-pro

# Restart after changing:
docker compose restart api
```

### Solution 2: Reduce Context
```
1. Select fewer sources
2. Or use "Summary Only" instead of "Full Content"
3. Or split large documents into smaller pieces
```

### Solution 3: For Ollama (Local)
```bash
# Use smaller model:
ollama pull phi  # Very small
# Instead of: ollama pull neural-chat  # Large
```

---

## "API call failed" or Timeout

**Symptom:** Generic API error, response times out

**Cause:** Provider API down, network issue, or slow service

**Solutions:**

### Check Provider Status
```
OpenAI: https://status.openai.com/
Anthropic: Check website
Google: Google Cloud Status
Groq: Check website
```

### Retry Operation
```
1. Wait 30 seconds
2. Try again
```

### Use Different Model/Provider

Change provider in your `.env` file:

```bash
# If OpenAI down, switch to Anthropic:
DEFAULT_CHAT_MODEL=anthropic/claude-sonnet-4-20250514
ANTHROPIC_API_KEY=sk-ant-...

# Restart:
docker compose restart api
```

### Check Network
```bash
# Verify internet working:
ping google.com

# Test API endpoint directly:
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

---

## Responses Include Hallucinations

**Symptom:** AI makes up facts that aren't in sources

**Cause:** Sources not in context, or model guessing

**Solutions:**

### Solution 1: Verify Context
```
1. Click citation in response
2. Check source actually says that
3. If not, sources weren't in context
4. Add source to context and try again
```

### Solution 2: Request Citations
```
Ask: "Answer this with citations to specific pages"

The AI will be more careful if asked for citations
```

### Solution 3: Use Stronger Model
```
Weaker models hallucinate more
Switch to: GPT-4o or Claude Sonnet
```

---

## High API Costs

**Symptom:** API bills are higher than expected

**Cause:** Using expensive model, large context, many requests

**Solutions:**

### Use Cheaper Model
```
Expensive: gpt-4o
Cheaper: gpt-4o-mini (10x cheaper)

Expensive: Claude Sonnet
Cheaper: Claude Haiku (5x cheaper)

Groq: Ultra cheap but fewer models
```

### Reduce Context
```
In Chat:
1. Select fewer sources
2. Use "Summary Only" for background
3. Ask more specific questions
```

### Switch to Ollama (Free)
```bash
# Install Ollama
# Run: ollama serve
# Download: ollama pull mistral
# Set: OLLAMA_API_BASE=http://localhost:11434
# Cost: Free!
```

---

## Still Having Chat Issues?

- Try [Quick Fixes](quick-fixes.md)
- Try [Chat Effectively Guide](../3-USER-GUIDE/chat-effectively.md)
- Check logs: `docker compose logs api | grep -i "error"`
- Ask for help: [Troubleshooting Index](index.md#getting-help)

# Scripts Documentation

## export_docs.py

Consolidates markdown documentation files for use with ChatGPT or other platforms with file upload limits.

### What It Does

- Scans all subdirectories in the `docs/` folder
- For each subdirectory, combines all `.md` files (excluding `index.md` files)
- Creates one consolidated markdown file per subdirectory
- Saves all exported files to `doc_exports/` in the project root

### Usage

```bash
# Using Makefile (recommended)
make export-docs

# Or run directly with uv
uv run python scripts/export_docs.py

# Or run with standard Python
python scripts/export_docs.py
```

### Output

The script creates `doc_exports/` directory with consolidated files like:

- `getting-started.md` - All getting-started documentation
- `user-guide.md` - All user guide content
- `features.md` - All feature documentation
- `development.md` - All development documentation
- etc.

Each exported file includes:
- A main header with the folder name
- Section headers for each source file
- Source file attribution
- The complete content from each markdown file
- Visual separators between sections

### Notes

- The `doc_exports/` directory is gitignored and safe to regenerate anytime
- Index files (`index.md`) are automatically excluded
- Files are sorted alphabetically for consistent output
- The script handles subdirectories only (ignores files in the root `docs/` folder)

---

## wait-for-api.sh

Health check script that waits for the API to be ready before starting dependent services (e.g., the frontend).

### What It Does

- Polls the API health endpoint (`/health`) using `curl`
- Retries up to 60 times with 5-second intervals (5-minute maximum wait)
- Exits with code 0 even on timeout, allowing dependent services to start regardless

### Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `INTERNAL_API_URL` | `http://localhost:5055` | API base URL to health-check |

### Usage

Typically invoked in Docker Compose or CI/CD pipelines rather than directly:

```bash
# Direct usage
./scripts/wait-for-api.sh

# With custom API URL
INTERNAL_API_URL=http://api:5055 ./scripts/wait-for-api.sh
```

---

## Vercel + Render deployment bundle

For a no-domain setup using provider URLs (`*.vercel.app` + `*.onrender.com`), use:

- `deploy/vercel-render/README.md`
- `deploy/vercel-render/render-api.env.example`
- `deploy/vercel-render/vercel.env.example`
- `deploy/vercel-render/smoke-test.sh`

---

## AWS Elastic Beanstalk deployment bundle

For a mostly hands-off single-service deployment using AWS credits, use:

- `deploy/aws-eb/README.md`
- `deploy/aws-eb/eb.env.example`
- `deploy/aws-eb/deploy.sh`

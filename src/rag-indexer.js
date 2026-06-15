/**
 * RAG (Retrieval-Augmented Generation) Codebase Indexer
 *
 * Phase 1: Lightweight local codebase indexing with text-based symbol extraction
 * and cosine-similarity retrieval using simple TF-IDF vectors with optional LLM embeddings.
 *
 * Design:
 * - No native deps (tree-sitter, sqlite-vec) — pure JS for Phase 1
 * - Index stored as JSON in `.coderev/index/`
 * - Two modes:
 *   1. Fast: TF-IDF on extracted symbols/functions (no LLM call, instant)
 *   2. Embedded: Uses LLM embeddings API for semantic search (needs API key, more accurate)
 * - Indexed content: function signatures, class definitions, import statements, type defs
 * - Diff context retrieval: given a changed file, find related symbols from the same
 *   file + cross-file references (imports/exports)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_DIR = '.coderev/index';
const INDEX_FILE = 'codebase-index.json';
const META_FILE = 'index-meta.json';

// File extensions to index
const INDEXABLE_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.rb', '.php',
  '.swift', '.kt', '.kts', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.sql', '.yaml', '.yml', '.toml',
  '.vue', '.svelte', '.astro',
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', '.output',
  'target', 'bin', 'obj', '.gradle', '.idea',
  'vendor', 'coverage', '.coderev',
]);

// Regex patterns for symbol extraction (language-agnostic)
const SYMBOL_PATTERNS = [
  // JavaScript/TypeScript: function declarations & arrow functions
  {
    lang: 'js/ts',
    re: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    type: 'function',
  },
  // JavaScript/TypeScript: arrow functions
  {
    lang: 'js/ts',
    re: /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/g,
    type: 'function',
  },
  // JavaScript/TypeScript: class declarations
  {
    lang: 'js/ts',
    re: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/g,
    type: 'class',
  },
  // JavaScript/TypeScript: method definitions in classes/objects
  {
    lang: 'js/ts',
    re: /(?:(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*\{)/g,
    type: 'method',
  },
  // JavaScript/TypeScript: imports
  {
    lang: 'js/ts',
    re: /(?:import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"])|(?:require\s*\(\s*['"]([^'"]+)['"]\s*\))/g,
    type: 'import',
  },
  // JavaScript/TypeScript: exports
  {
    lang: 'js/ts',
    re: /export\s+(?:default\s+)?(?:(?:function|class|const|let|var)\s+)?(\w+)/g,
    type: 'export',
  },
  // Python: function definitions
  {
    lang: 'python',
    re: /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/g,
    type: 'function',
  },
  // Python: class definitions
  {
    lang: 'python',
    re: /class\s+(\w+)(?:\s*\(([^)]*)\))?:/g,
    type: 'class',
  },
  // Python: imports
  {
    lang: 'python',
    re: /(?:from\s+(\S+)\s+import\s+(\S+))|(?:import\s+(\S+))/g,
    type: 'import',
  },
  // Go: function declarations
  {
    lang: 'go',
    re: /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)/g,
    type: 'function',
  },
  // Go: type/struct definitions
  {
    lang: 'go',
    re: /type\s+(\w+)\s+(?:struct|interface)\s*\{/g,
    type: 'type',
  },
  // Go: imports
  {
    lang: 'go',
    re: /"([^"]+)"/g,
    type: 'import',
  },
  // Rust: function definitions
  {
    lang: 'rust',
    re: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g,
    type: 'function',
  },
  // Rust: struct/enum/trait
  {
    lang: 'rust',
    re: /(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/g,
    type: 'type',
  },
  // Java/Kotlin: method declarations
  {
    lang: 'java/kotlin',
    re: /(?:(?:public|private|protected)\s+)?(?:static\s+)?\w+\s+(\w+)\s*\(([^)]*)\)/g,
    type: 'method',
  },
  // Java/Kotlin: class
  {
    lang: 'java/kotlin',
    re: /(?:public\s+)?class\s+(\w+)/g,
    type: 'class',
  },
];

// Language detection by extension
const EXT_LANG_MAP = {
  '.js': 'js/ts', '.jsx': 'js/ts', '.ts': 'js/ts', '.tsx': 'js/ts',
  '.mjs': 'js/ts', '.cjs': 'js/ts',
  '.py': 'python', '.pyw': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java/kotlin', '.kt': 'java/kotlin', '.kts': 'java/kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.c': 'c', '.cpp': 'c/cpp', '.h': 'c', '.hpp': 'c/cpp',
  '.cs': 'csharp',
  '.sql': 'sql',
  '.vue': 'js/ts', '.svelte': 'js/ts', '.astro': 'js/ts',
};

/**
 * Determine the language group for a file extension.
 */
function langForExt(ext) {
  return EXT_LANG_MAP[ext] || 'generic';
}

/**
 * Extract symbols from source code text.
 * Returns an array of { name, type, signature, lang, line } objects.
 */
function extractSymbols(source, filename) {
  const ext = path.extname(filename).toLowerCase();
  const lang = langForExt(ext);
  const symbols = [];
  const lines = source.split('\n');

  for (const pattern of SYMBOL_PATTERNS) {
    if (!pattern.lang.includes(lang) && pattern.lang !== 'generic') continue;

    // Reset lastIndex for new source
    const re = new RegExp(pattern.re.source, pattern.re.flags);

    let match;
    while ((match = re.exec(source)) !== null) {
      let name, signature;

      if (pattern.type === 'import') {
        // Import patterns: capture the module path
        name = match[1] || match[2] || match[3] || match[4] || '';
        // For Go multi-import blocks, filter noise
        if (lang === 'go' && name.startsWith('"') && name.endsWith('"')) {
          name = name.slice(1, -1);
        }
      } else {
        // Function/class/method: first capture group is name
        name = match[1];
        signature = match[2] || '';
      }

      if (!name || name.length < 1) continue;

      // Skip noise words (language-specific)
      const noise = ['if', 'for', 'while', 'switch', 'catch', 'return', 'throw',
        'typeof', 'instanceof', 'delete', 'void', 'else', 'case', 'default',
        'break', 'continue', 'try', 'finally', 'debugger', 'with'];
      if (noise.includes(name) && pattern.lang !== 'rust') continue;

      // Calculate line number
      const pos = match.index;
      const line = source.substring(0, pos).split('\n').length;

      symbols.push({
        name,
        type: pattern.type,
        signature: signature || '',
        lang,
        file: filename,
        line,
        // Context snippet for retrieval
        snippet: lines.slice(Math.max(0, line - 2), Math.min(lines.length, line + 3)).join('\n'),
      });
    }
  }

  return symbols;
}

/**
 * Simple TF-IDF style tokenizer for text.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_$]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !['the', 'and', 'for', 'with', 'from', 'this'].includes(t));
}

/**
 * Build a simple bag-of-words vector for a document.
 */
function bowVector(tokens, vocabulary) {
  const vec = new Array(vocabulary.size).fill(0);
  for (const token of tokens) {
    const idx = vocabulary.get(token);
    if (idx !== undefined) vec[idx]++;
  }
  return vec;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Build a TF-IDF index from extracted symbols.
 */
function buildTfIdfIndex(symbols) {
  // Build vocabulary
  const vocabSet = new Set();
  const docs = symbols.map(s => ({
    tokens: tokenize(`${s.name} ${s.signature} ${s.type} ${s.lang} ${s.file}`),
    symbol: s,
  }));

  for (const doc of docs) {
    for (const token of doc.tokens) vocabSet.add(token);
  }

  const vocabulary = new Map();
  [...vocabSet].forEach((word, i) => vocabulary.set(word, i));

  // Compute IDF
  const df = new Array(vocabulary.size).fill(0);
  for (const doc of docs) {
    const seen = new Set();
    for (const token of doc.tokens) {
      const idx = vocabulary.get(token);
      if (idx !== undefined && !seen.has(idx)) {
        df[idx]++;
        seen.add(idx);
      }
    }
  }

  const N = docs.length;
  const idf = df.map(d => d === 0 ? 0 : Math.log((N + 1) / (d + 1)) + 1);

  // Build TF-IDF vectors for each document
  const vectors = docs.map(doc => {
    const tf = new Array(vocabulary.size).fill(0);
    for (const token of doc.tokens) {
      const idx = vocabulary.get(token);
      if (idx !== undefined) tf[idx]++;
    }
    // TF normalization
    const maxTf = Math.max(...tf);
    if (maxTf > 0) {
      for (let i = 0; i < tf.length; i++) {
        tf[i] = 0.5 + 0.5 * (tf[i] / maxTf);
      }
    }
    return tf.map((v, i) => v * idf[i]);
  });

  return { vocabulary, idf, vectors, docs };
}

/**
 * Search the index for symbols relevant to the query.
 */
function searchIndex(index, query, topK = 10) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const queryVec = bowVector(queryTokens, index.vocabulary);

  // IDF weight the query
  for (let i = 0; i < queryVec.length; i++) {
    queryVec[i] *= (index.idf[i] || 1);
  }

  // Score all docs
  const scores = index.vectors.map((vec, i) => ({
    score: cosineSimilarity(queryVec, vec),
    symbol: index.docs[i].symbol,
  }));

  // Sort and return top K
  return scores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Build the codebase index.
 *
 * @param {string} repoRoot - Root directory of the repository
 * @param {object} [options]
 * @param {string[]} [options.includePatterns] - Glob patterns for files to include
 * @param {string[]} [options.excludePatterns] - Glob patterns for files to exclude
 * @param {number} [options.maxFiles=500] - Maximum number of files to index
 * @returns {object} Index object with symbols, stats, and search capability
 */
function buildIndex(repoRoot, options = {}) {
  const maxFiles = options.maxFiles || 500;
  const startTime = Date.now();
  const allSymbols = [];
  const filesScanned = [];
  let filesProcessed = 0;

  // Ensure index directory exists
  const indexDir = path.join(repoRoot, INDEX_DIR);
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  // Walk the directory tree
  function walk(dir, relativePath) {
    if (filesProcessed >= maxFiles) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      if (filesProcessed >= maxFiles) return;

      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(fullPath, relPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (INDEXABLE_EXTS.has(ext)) {
          try {
            const source = fs.readFileSync(fullPath, 'utf-8');
            // Skip very large files (> 500KB)
            if (source.length > 500 * 1024) return;

            const symbols = extractSymbols(source, relPath);
            allSymbols.push(...symbols);
            filesScanned.push(relPath);
            filesProcessed++;
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  walk(repoRoot, '');

  const tfidfIndex = buildTfIdfIndex(allSymbols);

  const stats = {
    filesScanned: filesProcessed,
    symbolsExtracted: allSymbols.length,
    timeMs: Date.now() - startTime,
    languageBreakdown: {},
  };

  for (const s of allSymbols) {
    stats.languageBreakdown[s.lang] = (stats.languageBreakdown[s.lang] || 0) + 1;
  }

  const index = {
    version: 1,
    createdAt: new Date().toISOString(),
    repoRoot,
    stats,
    symbols: allSymbols,
    tfidf: {
      // Store just what we need for search
      vocabulary: [...tfidfIndex.vocabulary.keys()],
      idf: tfidfIndex.idf,
      vectors: tfidfIndex.vectors,
      docs: tfidfIndex.docs.map(d => ({ symbol: d.symbol })),
    },
  };

  // Persist to disk
  try {
    fs.writeFileSync(path.join(indexDir, INDEX_FILE), JSON.stringify(index, null, 2), 'utf-8');
    fs.writeFileSync(path.join(indexDir, META_FILE), JSON.stringify({
      lastBuilt: new Date().toISOString(),
      filesScanned: filesProcessed,
      symbolsExtracted: allSymbols.length,
    }, null, 2), 'utf-8');
  } catch {
    // Non-fatal: index persists in memory even if write fails
  }

  return index;
}

/**
 * Load an existing index from disk.
 *
 * @param {string} repoRoot - Root directory of the repository
 * @returns {object|null} Index object or null if not found
 */
function loadIndex(repoRoot) {
  const indexPath = path.join(repoRoot, INDEX_DIR, INDEX_FILE);
  try {
    if (!fs.existsSync(indexPath)) return null;
    const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    // Rebuild vocabulary Map from stored array
    if (Array.isArray(data.tfidf) && Array.isArray(data.tfidf.vocabulary)) {
      data.tfidf.vocabulary = new Map(data.tfidf.vocabulary.map((w, i) => [w, i]));
    } else if (data.tfidf && Array.isArray(data.tfidf.vocabulary)) {
      data.tfidf.vocabulary = new Map(data.tfidf.vocabulary.map((w, i) => [w, i]));
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Retrieve relevant context for a given diff.
 *
 * Given a git diff (which tells us which files changed and what lines),
 * this function finds related symbols from the codebase index:
 * 1. Same-file context: symbols defined in the changed files
 * 2. Cross-file context: imports/exports related to changed files
 * 3. Semantic context: top-K similar symbols across the codebase
 *
 * @param {object} index - The codebase index (from buildIndex or loadIndex)
 * @param {string} diff - Git diff text
 * @param {object} [options]
 * @param {number} [options.maxContext=15] - Max symbols to return
 * @param {boolean} [options.includeSemantic=true] - Include semantic search results
 * @returns {object} Context object with symbols grouped by type
 */
function retrieveContext(index, diff, options = {}) {
  if (!index || !index.symbols || index.symbols.length === 0) {
    return { symbols: [], summary: 'No codebase index available. Run `coderev index` first.' };
  }

  const maxContext = options.maxContext || 15;
  const includeSemantic = options.includeSemantic !== false;

  // Extract changed file paths from diff
  const changedFiles = new Set();
  const diffLines = diff.split('\n');
  for (const line of diffLines) {
    const match = line.match(/^\+\+\+ b\/(.+)/);
    if (match) changedFiles.add(match[1]);
  }

  const results = new Map(); // file+name -> symbol dedup

  // 1. Same-file: symbols defined in changed files
  for (const sym of index.symbols) {
    if (changedFiles.has(sym.file)) {
      const key = `${sym.file}:${sym.name}`;
      if (!results.has(key)) results.set(key, { ...sym, relevance: 'same_file' });
    }
  }

  // 2. Cross-file: imports/exports related to changed files
  // Find modules imported by changed files
  for (const sym of index.symbols) {
    if (changedFiles.has(sym.file) && sym.type === 'import' && sym.name) {
      // Find symbols exported by the imported module
      for (const other of index.symbols) {
        if (other.type === 'export' && other.file.includes(sym.name.replace(/^\.?\/?/, ''))) {
          const key = `${other.file}:${other.name}`;
          if (!results.has(key)) results.set(key, { ...other, relevance: 'cross_file' });
        }
      }
    }
  }

  // 3. Semantic search: find similar symbols across codebase
  if (includeSemantic && results.size < maxContext) {
    // Build query from diff context (focus on function/class names in diff)
    const queryParts = [];
    for (const sym of index.symbols) {
      if (changedFiles.has(sym.file)) {
        queryParts.push(sym.name);
        queryParts.push(sym.type);
      }
    }
    const query = queryParts.join(' ') || diffLines.slice(0, 20).join(' ');

    // searchIndex expects the flat TF-IDF structure with Map vocabulary
    const tfidf = index.tfidf || index;
    // Ensure vocabulary is a Map (may be stored as array in JSON)
    if (Array.isArray(tfidf.vocabulary)) {
      tfidf.vocabulary = new Map(tfidf.vocabulary.map((w, i) => [w, i]));
    }
    const semanticResults = searchIndex(tfidf, query, maxContext);
    for (const r of semanticResults) {
      if (changedFiles.has(r.symbol.file)) continue; // Already have same-file
      const key = `${r.symbol.file}:${r.symbol.name}`;
      if (!results.has(key)) {
        results.set(key, { ...r.symbol, relevance: 'semantic', score: r.score.toFixed(3) });
      }
    }
  }

  // Convert to array, limit
  const contextSymbols = [...results.values()].slice(0, maxContext);

  // Group by relevance
  const grouped = {
    sameFile: contextSymbols.filter(s => s.relevance === 'same_file'),
    crossFile: contextSymbols.filter(s => s.relevance === 'cross_file'),
    semantic: contextSymbols.filter(s => s.relevance === 'semantic'),
  };

  return {
    symbols: contextSymbols,
    grouped,
    changedFiles: [...changedFiles],
    totalIndexed: index.symbols.length,
    summary: formatContextSummary(grouped, changedFiles),
  };
}

/**
 * Format context as a compact text block for prompt injection.
 */
function formatContextSummary(grouped, changedFiles) {
  const parts = [];

  if (changedFiles.length > 0) {
    parts.push(`Changed files: ${changedFiles.join(', ')}`);
  }

  if (grouped.sameFile.length > 0) {
    parts.push(`\n📄 Same-file context (${grouped.sameFile.length} symbols):`);
    for (const s of grouped.sameFile.slice(0, 10)) {
      parts.push(`  ${s.type}: ${s.name}${s.signature ? `(${s.signature})` : ''} (${s.file}:${s.line})`);
    }
  }

  if (grouped.crossFile.length > 0) {
    parts.push(`\n🔗 Related symbols (${grouped.crossFile.length}):`);
    for (const s of grouped.crossFile.slice(0, 5)) {
      parts.push(`  ${s.type}: ${s.name} in ${s.file}`);
    }
  }

  if (grouped.semantic.length > 0) {
    parts.push(`\n🔍 Similar symbols across codebase (${grouped.semantic.length}):`);
    for (const s of grouped.semantic.slice(0, 5)) {
      parts.push(`  ${s.type}: ${s.name} in ${s.file}`);
    }
  }

  return parts.join('\n');
}

/**
 * Build a context string for injection into review prompts.
 * This is the main integration point with reviewer.js
 *
 * @param {object} index - The codebase index
 * @param {string} diff - Git diff text
 * @param {object} [options]
 * @returns {string} Context string for prompt injection
 */
function buildReviewContext(index, diff, options = {}) {
  if (!index) return '';

  const ctx = retrieveContext(index, diff, options);
  if (!ctx.symbols || ctx.symbols.length === 0) return '';

  let contextBlock = `
## 📚 Codebase Context (Retrieved via RAG)

The following symbols were found in the codebase that may be relevant to this change:

`;

  // Same-file symbols (most important)
  if (ctx.grouped.sameFile.length > 0) {
    contextBlock += `### Same File Symbols\n`;
    for (const s of ctx.grouped.sameFile.slice(0, 8)) {
      contextBlock += `- \`${s.type}\` **${s.name}**${s.signature ? `(${s.signature})` : ''} at line ${s.line}\n`;
      if (s.snippet && s.snippet.length < 300) {
        contextBlock += `  \`\`\`\n${s.snippet}\n  \`\`\`\n`;
      }
    }
  }

  // Cross-file references
  if (ctx.grouped.crossFile.length > 0) {
    contextBlock += `### Cross-File References\n`;
    for (const s of ctx.grouped.crossFile.slice(0, 5)) {
      contextBlock += `- \`${s.type}\` **${s.name}** in \`${s.file}\`\n`;
    }
  }

  // Semantic matches
  if (ctx.grouped.semantic.length > 0) {
    contextBlock += `### Semantically Similar\n`;
    for (const s of ctx.grouped.semantic.slice(0, 5)) {
      contextBlock += `- \`${s.type}\` **${s.name}** in \`${s.file}\`\n`;
    }
  }

  contextBlock += `\nUse this context to understand call chains, type relationships, and coding patterns.`;

  return contextBlock;
}

/**
 * Check if an index needs rebuilding (stale or non-existent).
 *
 * @param {string} repoRoot - Repository root
 * @param {number} [maxAgeHours=24] - Max age in hours before considered stale
 * @returns {boolean}
 */
function isIndexStale(repoRoot, maxAgeHours = 24) {
  const metaPath = path.join(repoRoot, INDEX_DIR, META_FILE);
  try {
    if (!fs.existsSync(metaPath)) return true;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const builtTime = new Date(meta.lastBuilt).getTime();
    return (Date.now() - builtTime) > maxAgeHours * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

module.exports = {
  buildIndex,
  loadIndex,
  retrieveContext,
  buildReviewContext,
  extractSymbols,
  searchIndex,
  buildTfIdfIndex,
  isIndexStale,
  INDEX_DIR,
  INDEXABLE_EXTS,
  SKIP_DIRS,
};

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  extractSymbols,
  buildTfIdfIndex,
  searchIndex,
  buildIndex,
  loadIndex,
  retrieveContext,
  buildReviewContext,
  isIndexStale,
  INDEX_DIR,
} = require('./rag-indexer');

// Helper: create a temporary directory with test files
function createTestRepo(files) {
  const dir = path.join(os.tmpdir(), 'coderev-rag-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  return dir;
}

describe('extractSymbols', () => {
  it('should extract function declarations from JavaScript', () => {
    const source = `
function hello(name) {
  return "Hello " + name;
}

const arrow = (x) => x * 2;

class MyClass {
  constructor() { }
  getValue() { return 42; }
}

import { foo } from './bar';
export default hello;
`;
    const symbols = extractSymbols(source, 'test.js');

    const names = symbols.map(s => s.name);
    assert.ok(names.includes('hello'), 'should find hello function');
    assert.ok(names.includes('arrow'), 'should find arrow function');
    assert.ok(names.includes('MyClass'), 'should find MyClass');
    assert.ok(names.includes('getValue'), 'should find getValue method');
  });

  it('should extract import paths from JavaScript', () => {
    const source = `import React from 'react';
import { useState } from './hooks';`;
    const symbols = extractSymbols(source, 'test.js');
    const imports = symbols.filter(s => s.type === 'import');
    assert.ok(imports.some(s => s.name.includes('react')), 'should find react import');
  });

  it('should extract Python functions and classes', () => {
    const source = `
def calculate(a, b):
    return a + b

class Calculator:
    def add(self, x, y):
        return x + y
`;
    const symbols = extractSymbols(source, 'test.py');
    const names = symbols.map(s => s.name);
    assert.ok(names.includes('calculate'), 'should find calculate function');
    assert.ok(names.includes('Calculator'), 'should find Calculator class');
    assert.ok(names.includes('add'), 'should find add method');
  });

  it('should extract Go functions and types', () => {
    const source = `
func main() {
    fmt.Println("hello")
}

func (s *Server) Start(port int) error {
    return nil
}

type Config struct {
    Host string
}
`;
    const symbols = extractSymbols(source, 'test.go');
    const names = symbols.map(s => s.name);
    assert.ok(names.includes('main'), 'should find main');
    assert.ok(names.includes('Start'), 'should find Start');
    assert.ok(names.includes('Config'), 'should find Config struct');
  });

  it('should extract Rust functions and types', () => {
    const source = `
pub fn new() -> Self {
    Self {}
}

pub struct User {
    name: String,
}

pub trait Display {
    fn fmt(&self) -> String;
}
`;
    const symbols = extractSymbols(source, 'test.rs');
    const names = symbols.map(s => s.name);
    assert.ok(names.includes('new'), 'should find new');
    assert.ok(names.includes('User'), 'should find User struct');
    assert.ok(names.includes('Display'), 'should find Display trait');
  });

  it('should extract Java/Kotlin methods and classes', () => {
    const source = `
public class UserService {
    public User findById(Long id) {
        return repository.findById(id);
    }
}
`;
    const symbols = extractSymbols(source, 'test.java');
    const names = symbols.map(s => s.name);
    assert.ok(names.includes('UserService'), 'should find UserService class');
    assert.ok(names.includes('findById'), 'should find findById method');
  });

  it('should not extract noise keywords', () => {
    const source = `if (x > 0) { return x; } for (;;) { break; } while (true) { continue; }`;
    const symbols = extractSymbols(source, 'test.js');
    const noise = ['if', 'for', 'while', 'return', 'break', 'continue'];
    for (const s of symbols) {
      assert.ok(!noise.includes(s.name), `${s.name} should not be extracted`);
    }
  });

  it('should include line numbers in extracted symbols', () => {
    const source = `// line 1\n// line 2\nfunction findMe() {\n  return 1;\n}`;
    const symbols = extractSymbols(source, 'test.js');
    const found = symbols.find(s => s.name === 'findMe');
    assert.ok(found, 'should find findMe');
    assert.equal(found.line, 3, 'should be on line 3');
    assert.equal(found.type, 'function');
  });

  it('should assign correct language based on extension', () => {
    const js = extractSymbols('function test() {}', 'a.js');
    assert.equal(js[0].lang, 'js/ts');

    const py = extractSymbols('def test():\\n    pass', 'b.py');
    assert.equal(py[0].lang, 'python');

    const go = extractSymbols('func Test() {}', 'c.go');
    assert.equal(go[0].lang, 'go');

    const rs = extractSymbols('fn test() {}', 'd.rs');
    assert.equal(rs[0].lang, 'rust');
  });
});

describe('buildTfIdfIndex + searchIndex', () => {
  it('should build index and find relevant symbols', () => {
    const symbols = [
      { name: 'getUser', signature: 'id', type: 'function', lang: 'js/ts', file: 'api/users.js', line: 10, snippet: '' },
      { name: 'UserService', signature: '', type: 'class', lang: 'js/ts', file: 'api/users.js', line: 1, snippet: '' },
      { name: 'calculate', signature: 'a, b', type: 'function', lang: 'python', file: 'calc.py', line: 5, snippet: '' },
      { name: 'render', signature: '', type: 'function', lang: 'js/ts', file: 'ui/app.js', line: 20, snippet: '' },
    ];

    const index = buildTfIdfIndex(symbols);

    // Search for user-related symbols
    const results = searchIndex(index, 'user api', 3);
    assert.ok(results.length > 0, 'should find results');
    assert.ok(results.some(r => r.symbol.name === 'getUser'), 'should find getUser');
    assert.ok(results.some(r => r.symbol.name === 'UserService'), 'should find UserService');
  });

  it('should return empty results for unknown queries', () => {
    const symbols = [
      { name: 'getUser', signature: '', type: 'function', lang: 'js/ts', file: 'api.js', line: 1, snippet: '' },
    ];
    const index = buildTfIdfIndex(symbols);
    const results = searchIndex(index, 'unknown_term_xyz', 3);
    assert.equal(results.length, 0, 'should return no results for unrelated query');
  });

  it('should respect topK limit', () => {
    const symbols = [];
    for (let i = 0; i < 50; i++) {
      symbols.push({
        name: `func${i}`,
        signature: '',
        type: 'function',
        lang: 'js/ts',
        file: `file${i}.js`,
        line: i,
        snippet: '',
      });
    }
    const index = buildTfIdfIndex(symbols);
    const results = searchIndex(index, 'func', 5);
    assert.ok(results.length <= 5, 'should respect topK limit');
  });
});

describe('buildIndex + loadIndex', () => {
  it('should index a real directory structure', () => {
    const repo = createTestRepo({
      'src/index.js': 'module.exports = function main() { return 1; };',
      'src/utils.js': 'function helper(x) { return x * 2; }',
      'lib/auth.js': 'class Auth { login() {} logout() {} }',
      'README.md': '# Test', // Not indexable
      'package.json': '{}', // Not indexable
    });

    const index = buildIndex(repo, { maxFiles: 100 });

    assert.ok(index.stats.filesScanned >= 3, 'should scan at least 3 JS files');
    assert.ok(index.stats.symbolsExtracted >= 4, 'should extract symbols');
    assert.ok(index.stats.timeMs > 0, 'should measure time');
    assert.equal(typeof index.stats.languageBreakdown['js/ts'], 'number', 'should have JS language stat');

    // Check index persistence
    const indexPath = path.join(repo, INDEX_DIR, 'codebase-index.json');
    assert.ok(fs.existsSync(indexPath), 'should persist index file');

    const metaPath = path.join(repo, INDEX_DIR, 'index-meta.json');
    assert.ok(fs.existsSync(metaPath), 'should persist meta file');

    // Cleanup
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('should load a persisted index', () => {
    const repo = createTestRepo({
      'src/app.js': 'function init() { return true; }',
    });

    const built = buildIndex(repo, { maxFiles: 100 });
    const loaded = loadIndex(repo);

    assert.ok(loaded, 'should load index');
    assert.equal(loaded.stats.symbolsExtracted, built.stats.symbolsExtracted, 'should match built stats');
    assert.ok(loaded.tfidf.vocabulary instanceof Map, 'should rebuild vocabulary Map');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('should return null for non-existent index', () => {
    const index = loadIndex('/nonexistent/path');
    assert.equal(index, null);
  });

  it('should skip node_modules directory', () => {
    const repo = createTestRepo({
      'src/app.js': 'function init() {}',
      'node_modules/lib/index.js': 'function hack() {}', // Should be skipped
    });

    const index = buildIndex(repo, { maxFiles: 100 });
    const symFiles = index.symbols.map(s => s.file);

    assert.ok(symFiles.some(f => f.includes('src/app.js')), 'should include src');
    assert.ok(!symFiles.some(f => f.includes('node_modules')), 'should skip node_modules');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('should respect maxFiles limit', () => {
    const repo = createTestRepo({});
    // Create many files
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(repo, `file${i}.js`), `function f${i}() { return ${i}; }`, 'utf-8');
    }

    const index = buildIndex(repo, { maxFiles: 5 });
    assert.ok(index.stats.filesScanned <= 5, 'should not exceed maxFiles');

    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe('retrieveContext + buildReviewContext', () => {
  it('should retrieve same-file context from changed files', () => {
    const repo = createTestRepo({
      'src/api.js': 'function getUsers() { return []; }\nfunction saveUser(data) { return {}; }\nclass UserRepo { find() {} }',
      'src/app.js': 'function main() { getUsers(); }',
    });

    const index = buildIndex(repo);

    const diff = `diff --git a/src/api.js b/src/api.js
--- a/src/api.js
+++ b/src/api.js
@@ -1,3 +1,4 @@
 function getUsers() { return []; }
+function deleteUser(id) { return true; }
`;
    const ctx = retrieveContext(index, diff);

    assert.ok(ctx.symbols.length > 0, 'should find symbols');
    assert.ok(ctx.changedFiles.includes('src/api.js'), 'should detect changed file');
    assert.ok(ctx.grouped.sameFile.some(s => s.name === 'getUsers'), 'should find same-file symbol');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('should return empty context when no index available', () => {
    const ctx = retrieveContext(null, 'some diff');
    assert.equal(ctx.symbols.length, 0);
    assert.ok(ctx.summary.includes('No codebase index'));
  });

  it('should return empty context for empty symbols', () => {
    const ctx = retrieveContext({ symbols: [] }, 'some diff');
    assert.equal(ctx.symbols.length, 0);
  });

  it('should build review context string for prompt injection', () => {
    const repo = createTestRepo({
      'src/auth.js': 'function login(user, pass) { return true; }\nclass AuthService { validate() {} }',
    });

    const index = buildIndex(repo);

    const diff = `diff --git a/src/auth.js b/src/auth.js
--- a/src/auth.js
+++ b/src/auth.js
@@ -1,1 +1,2 @@
+function logout() { return true; }
`;
    const contextStr = buildReviewContext(index, diff);

    assert.ok(contextStr.includes('Codebase Context'), 'should include codebase context header');
    assert.ok(contextStr.includes('Same File Symbols'), 'should include same-file section');
    assert.ok(contextStr.includes('login'), 'should include login function');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('should build empty context for empty index', () => {
    const result = buildReviewContext(null, 'some diff');
    assert.equal(result, '');
  });
});

describe('isIndexStale', () => {
  it('should return true for non-existent index', () => {
    assert.equal(isIndexStale('/nonexistent-path'), true);
  });

  it('should detect stale index', async () => {
    const repo = createTestRepo({
      'src/app.js': 'function test() {}',
    });

    buildIndex(repo);
    // Wait 50ms to ensure at least some time has passed since index build
    await new Promise(r => setTimeout(r, 50));
    assert.equal(isIndexStale(repo, 0), true, 'should be stale with maxAge 0');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('should detect fresh index', () => {
    const repo = createTestRepo({
      'src/app.js': 'function test() {}',
    });

    buildIndex(repo);
    assert.equal(isIndexStale(repo, 999999), false, 'should be fresh with large maxAge');

    fs.rmSync(repo, { recursive: true, force: true });
  });
});

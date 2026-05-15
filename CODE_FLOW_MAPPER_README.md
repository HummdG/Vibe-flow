# Code Flow Mapper - VS Code Extension

A powerful AI-powered VS Code extension that analyzes codebases across multiple programming languages and produces a unified, language-agnostic structural call-graph and execution-flow representation.

## Features

### 🔍 Multi-Language Support

The extension supports comprehensive analysis across:
- **Python**
- **JavaScript & TypeScript**
- **TypeScript React (TSX)**
- **Java**
- **C#**
- **Go**
- **C & C++**
- **Rust**
- **PHP**
- **Kotlin**
- **Swift**

### 🚀 Three Analysis Modes

1. **Static Analysis** - Build a cross-file call graph
   - Extracts functions, methods, classes, interfaces
   - Maps call relationships and dependencies
   - Generates language-agnostic representation

2. **Change Diff** - Highlight structural differences
   - Compare two code versions
   - Track added/removed/modified symbols
   - Identify new dependencies and removed connections

3. **Runtime Trace** - Map execution onto static graph
   - Import runtime traces from any source
   - Map stack traces to static symbols
   - Explain execution flow in plain language

4. **🆕 Auto-Capture Runtime** - Automatic execution flow capture
   - **Zero setup required**
   - Automatically captures as you debug
   - No manual trace files needed
   - Real-time execution analysis

## Usage

### Command Palette Commands

Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run:

- **Code Flow Mapper: Analyze Static Call Graph**
  - Analyzes entire workspace and generates call graph
  
- **Code Flow Mapper: Analyze Changes (Diff)**
  - Compare current code with previous version
  
- **Code Flow Mapper: Analyze Runtime Trace**
  - Import a trace file and map it to code structure
  
- **Code Flow Mapper: Analyze with Custom Input**
  - Provide custom JSON input for advanced scenarios

- **🆕 Vibe Flow: Start Auto-Capture Runtime Flow**
  - Start automatically capturing execution flow while debugging
  
- **🆕 Vibe Flow: Stop Auto-Capture and Analyze**
  - Stop capture and analyze the execution flow
  
- **🆕 Vibe Flow: Capture Current Debug Session**
  - Quick snapshot of current debug execution state

### Output Format

All analysis results are returned as JSON with this structure:

```json
{
  "nodes": [
    {
      "id": "unique-symbol-id",
      "name": "functionName",
      "kind": "function|method|class|interface|...",
      "language": "Python|JavaScript|...",
      "file": "path/to/file.py",
      "module": "module.path",
      "line": 10,
      "column": 4,
      "parent_symbol": "parent-id-or-null",
      "async": true,
      "visibility": "public|private|protected|null"
    }
  ],
  "edges": [
    {
      "from": "caller-id",
      "to": "callee-id",
      "type": "call|method_call|constructor|...",
      "file": "path/to/file.py",
      "line": 15,
      "column": 8,
      "via": "functionName"
    }
  ],
  "files": [
    {
      "path": "path/to/file.py",
      "language": "Python",
      "defines": ["symbol-ids"],
      "reads_from_files": ["paths"],
      "writes_to_files": ["paths"],
      "calls_out_to_files": ["paths"]
    }
  ],
  "diff": null,
  "execution": null,
  "summary": {
    "static_overview": "Human-readable summary...",
    "changes_overview": null,
    "runtime_overview": null,
    "notable_files": ["important/file.py"],
    "notable_symbols": ["frequently-called-ids"]
  },
  "warnings": []
}
```

## Architecture

The extension is built with modularity and best practices:

```
src/
├── types.ts                    # Type definitions
├── utils/
│   ├── languageDetector.ts    # Language detection
│   ├── idGenerator.ts          # Unique ID generation
│   └── pathResolver.ts         # Cross-language path resolution
├── analyzers/
│   ├── BaseLanguageAnalyzer.ts # Base analyzer interface
│   ├── JavaScriptAnalyzer.ts   # JS/TS analyzer
│   ├── PythonAnalyzer.ts       # Python analyzer
│   ├── JavaAnalyzer.ts         # Java analyzer
│   └── AnalyzerFactory.ts      # Analyzer factory
├── core/
│   ├── StaticGraphBuilder.ts   # Static analysis engine
│   ├── ChangeDiffAnalyzer.ts   # Diff analysis engine
│   ├── RuntimeTraceMapper.ts   # Runtime mapping engine
│   └── CodeFlowMapper.ts       # Main orchestrator
├── codeFlowExtension.ts        # VS Code integration
└── extension.ts                # Extension entry point
```

## Custom JSON Input

For advanced usage, you can provide custom JSON input:

```json
{
  "mode": "static",
  "files": [
    {
      "path": "src/main.py",
      "language": "Python",
      "content": "def hello():\n    print('world')"
    }
  ],
  "prev_files": [],
  "trace_events": [],
  "focus": {
    "entrypoints": ["main"],
    "regions": ["src/"]
  }
}
```

### Modes

- `"static"` - Static call graph analysis
- `"change_diff"` - Requires `prev_files`
- `"runtime"` - Requires `trace_events`

### Trace Event Format

```json
[
  {
    "timestamp": "2025-01-01T12:00:00Z",
    "type": "function_call",
    "description": "User clicked submit button",
    "file": "src/main.py",
    "line": 42,
    "function": "handleSubmit",
    "stack": ["main", "handleSubmit", "validate"]
  }
]
```

## Examples

### Example 1: Static Analysis

Analyzes a Python project and finds all function calls:

**Input**: Current workspace files

**Output**: 
- 25 functions found
- 42 call relationships identified
- Cross-file dependencies mapped

### Example 2: Change Diff

Compare two Git commits to see structural changes:

**Input**: 
- Current code (HEAD)
- Previous code (HEAD~1)

**Output**:
- 3 functions added
- 1 function removed
- 5 new call relationships
- 2 removed connections

### Example 3: Runtime Trace

Map a runtime execution trace onto the static code:

**Input**:
- Current code
- Runtime trace JSON

**Output**:
- Execution path visualized
- 8 symbols touched during execution
- High-level intent: "User submitted form, validated input, saved to database"

## Development

### Building

```bash
npm install
npm run compile
```

### Testing

```bash
npm run test
```

### Debugging

Press `F5` in VS Code to launch Extension Development Host

## Design Principles

1. **Language Agnostic** - Unified representation across all languages
2. **Modular Architecture** - Easy to add new language analyzers
3. **Precision over Speculation** - Only include verified relationships
4. **JSON-First** - Machine-readable output for integration
5. **Scalable** - Handles large codebases efficiently

## Limitations

- Git integration for diff mode is not yet implemented
- Generic fallback analyzer has limited capabilities
- Some language-specific features may not be captured
- Runtime trace mapping requires well-formatted input

## Future Enhancements

- [ ] Visual graph rendering
- [ ] Git integration for automatic diff comparison
- [ ] Interactive exploration UI
- [ ] Export to various formats (GraphML, DOT, etc.)
- [ ] Performance profiling integration
- [ ] Test coverage mapping
- [ ] Cyclomatic complexity analysis

## License

MIT

## Contributing

Contributions welcome! Please submit issues and pull requests.


# Quick Start Guide - Code Flow Mapper

## 🚀 Getting Started in 5 Minutes

### Step 1: Install & Build

```bash
cd "c:\Work\Arkalith\Vibe Flow"
npm install
npm run compile
```

### Step 2: Run the Extension

1. Press `F5` in VS Code to open Extension Development Host
2. Open any project folder in the new window

### Step 3: Analyze Your Code

**Option A: Static Analysis (Recommended for first try)**

1. Open Command Palette: `Ctrl+Shift+P` (Windows) or `Cmd+Shift+P` (Mac)
2. Type: `Code Flow Mapper: Analyze Static Call Graph`
3. Wait for analysis to complete
4. View the JSON result (auto-opens in editor)

**Option B: Try the Examples**

1. Open Command Palette
2. Type: `Code Flow Mapper: Analyze with Custom Input`
3. Select `example-static-input.json` or `example-runtime-input.json`
4. View results

## 📋 Available Commands

| Command | What It Does |
|---------|-------------|
| **Analyze Static Call Graph** | Scans your entire workspace and builds a call graph |
| **Analyze Changes (Diff)** | Compares current code with a git reference |
| **Analyze Runtime Trace** | Maps execution traces to code structure |
| **Analyze with Custom Input** | Advanced usage with custom JSON input |
| **Start Auto-Capture Runtime Flow** | 🆕 Automatically captures execution as you debug |
| **Stop Auto-Capture and Analyze** | 🆕 Stops capture and analyzes the flow |
| **Capture Current Debug Session** | 🆕 Quick snapshot of current debug state |
| **Show Flow Diagram** | 🆕 Visualize analysis results as beautiful diagrams |

## 🎨 NEW: Visual Flow Diagrams

**See your code flow, not just JSON!**

After running any analysis:
1. Click "Show Diagram" button in the notification
2. Choose: Flowchart, Class Diagram, or Sequence Diagram
3. View beautiful, interactive visualization!

**Learn more**: See [DIAGRAM_VISUALIZATION_GUIDE.md](./DIAGRAM_VISUALIZATION_GUIDE.md)

## 🎬 NEW: Auto-Capture Runtime Flow

**No manual trace files needed!** Just start debugging and capture execution automatically.

**Quick Start:**
1. Start debugging your code (F5)
2. Run: `Vibe Flow: Start Auto-Capture Runtime Flow`
3. Step through your code (F10/F11)
4. Run: `Vibe Flow: Stop Auto-Capture and Analyze`
5. View automatic execution flow analysis!

**Learn more**: See [AUTO_CAPTURE_GUIDE.md](./AUTO_CAPTURE_GUIDE.md) for complete tutorial.

## 📊 Understanding the Output

### Basic Output Structure

```json
{
  "nodes": [/* all functions, classes, methods found */],
  "edges": [/* all call relationships */],
  "files": [/* file-level summaries */],
  "summary": {
    "static_overview": "Human-readable summary here"
  }
}
```

### Example Node

```json
{
  "id": "src/app:function:main:10",
  "name": "main",
  "kind": "function",
  "language": "Python",
  "file": "src/app.py",
  "line": 10,
  "visibility": "public"
}
```

### Example Edge

```json
{
  "from": "src/app:function:main:10",
  "to": "src/utils:function:helper:5",
  "type": "call",
  "file": "src/app.py",
  "line": 15
}
```

## 🎯 Common Use Cases

### Use Case 1: Understanding a New Codebase

```
1. Run "Analyze Static Call Graph"
2. Look at summary.notable_files to find important files
3. Look at summary.notable_symbols to find frequently-called functions
4. Use edges to trace call paths
```

### Use Case 2: Finding Breaking Changes

```
1. Run "Analyze Changes (Diff)"
2. Enter git reference (e.g., "main" or "HEAD~5")
3. Check diff.added_nodes and diff.removed_nodes
4. Review diff.modified_nodes for changes
```

### Use Case 3: Debugging Execution Flow

```
1. Capture runtime trace (from logs, debugger, telemetry)
2. Format as JSON (see example-runtime-input.json)
3. Run "Analyze Runtime Trace"
4. See execution.steps for mapped execution path
```

## 🛠️ Tips & Tricks

### Tip 1: Filter Large Results

The JSON output can be large. Use VS Code's search:
- `Ctrl+F` to search in results
- Filter by file: search for `"file": "yourfile.py"`
- Filter by symbol: search for `"name": "functionName"`

### Tip 2: Visualize with External Tools

Export the JSON and use:
- **Graphviz** - Convert to DOT format
- **D3.js** - Interactive web visualization
- **Neo4j** - Graph database import

### Tip 3: Automate Analysis

Use the programmatic API:

```typescript
import { CodeFlowMapper } from './core/CodeFlowMapper';

const mapper = new CodeFlowMapper(workspaceRoot);
const result = await mapper.analyze({
  mode: 'static',
  files: yourFiles
});
```

## 🐛 Troubleshooting

### Problem: "No supported files found"

**Solution:** Ensure your workspace contains files with these extensions:
- `.ts`, `.js`, `.tsx`, `.jsx`
- `.py`
- `.java`, `.cs`, `.go`, `.rs`, `.php`, `.kt`, `.swift`

### Problem: "No connections detected"

**Possible causes:**
1. Functions don't call each other
2. External library calls (excluded by design)
3. Language not fully supported

**Solution:** Check the `warnings` array in output for details

### Problem: "Analysis taking too long"

**Solutions:**
1. Exclude large directories (node_modules, build, etc.) - Already handled!
2. Analyze specific subdirectories only
3. Use custom input with selected files

## 📚 Learn More

- Read `CODE_FLOW_MAPPER_README.md` for full documentation
- Check `IMPLEMENTATION_SUMMARY.md` for technical details
- Review example files: `example-static-input.json`, `example-runtime-input.json`

## 💡 Example Workflow

### Scenario: New Developer Onboarding

```bash
# Day 1: Get the big picture
1. Run static analysis
2. Review summary.static_overview
3. Identify entry points in notable_files

# Day 2: Trace a feature
4. Find feature's main function in nodes
5. Follow edges to understand call flow
6. Document findings

# Day 3: Make changes safely
7. Before changing: run static analysis (baseline)
8. After changing: run diff analysis
9. Verify only intended changes appear
```

## 🎓 Next Steps

1. ✅ Run static analysis on your project
2. ✅ Explore the JSON output
3. ✅ Try custom input with example files
4. ✅ Read the full documentation
5. 🚀 Integrate into your workflow!

## 🤝 Support

Having issues? Check:
1. Output panel: `View > Output > Extension Host`
2. Developer Tools: `Help > Toggle Developer Tools`
3. Warnings in analysis result JSON

---

**Happy Analyzing! 🎉**

The Code Flow Mapper is designed to help you understand code faster, make changes safer, and debug issues more effectively.



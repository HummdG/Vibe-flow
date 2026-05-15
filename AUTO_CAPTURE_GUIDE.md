# Auto-Capture Runtime Flow - User Guide

## 🎬 What is Auto-Capture?

Auto-Capture is a powerful feature that **automatically captures your code's execution flow in real-time** as you debug. No manual trace files needed—just start debugging and the extension does the rest!

## ✨ Key Features

- **Zero Configuration**: No setup required, works with any debug session
- **Real-Time Capture**: Automatically records execution as you debug
- **No Manual Traces**: Eliminates the need to manually create trace files
- **Integrated Analysis**: Automatically maps captured flow to your code structure
- **Multiple Debug Types**: Works with Node.js, Python, Java, and any VS Code debugger

## 🚀 Quick Start

### Method 1: Start-Stop Capture (Recommended)

This method gives you full control over what gets captured.

#### Step 1: Start Debugging
```
1. Set breakpoints in your code
2. Press F5 to start debugging
3. Your code will pause at the first breakpoint
```

#### Step 2: Start Auto-Capture
```
1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type: "Vibe Flow: Start Auto-Capture Runtime Flow"
3. Press Enter
4. You'll see: "🎬 Auto-capture started!"
```

#### Step 3: Execute Your Code
```
Step through your code normally:
- F10 (Step Over)
- F11 (Step Into)
- F5 (Continue)

Every step is automatically captured!
```

#### Step 4: Stop and Analyze
```
1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type: "Vibe Flow: Stop Auto-Capture and Analyze"
3. Press Enter
4. View the automatic analysis results!
```

### Method 2: Quick Capture

Capture the current debug session state instantly.

```
1. Start debugging (F5)
2. Pause at any point in your code
3. Run: "Vibe Flow: Capture Current Debug Session"
4. View instant analysis results!
```

## 📋 Available Commands

| Command | Shortcut | What It Does |
|---------|----------|--------------|
| **Start Auto-Capture Runtime Flow** | - | Starts capturing execution flow |
| **Stop Auto-Capture and Analyze** | - | Stops capture and analyzes the flow |
| **Capture Current Debug Session** | - | Quick snapshot of current execution |

## 💡 Use Cases

### Use Case 1: Understanding Code Execution

**Scenario**: You want to understand how a complex function works.

```
1. Set breakpoint at function start
2. Start debugging (F5)
3. Start auto-capture
4. Step through the function (F10/F11)
5. Stop auto-capture and analyze
6. See exactly what functions were called and in what order!
```

### Use Case 2: Debugging Issues

**Scenario**: You have a bug but don't know the execution path.

```
1. Set breakpoint before the bug occurs
2. Start debugging (F5)
3. Start auto-capture
4. Run until bug happens
5. Stop auto-capture
6. See the exact execution path that led to the bug!
```

### Use Case 3: Performance Analysis

**Scenario**: You want to see which functions are called most.

```
1. Start debugging your application
2. Start auto-capture
3. Execute the slow operation
4. Stop auto-capture
5. Analyze the captured flow to see function call patterns!
```

### Use Case 4: Code Review

**Scenario**: Reviewing changes and want to verify execution flow.

```
1. Debug the new code
2. Start auto-capture
3. Execute the new feature
4. Stop auto-capture
5. Verify the execution matches expectations!
```

## 🎯 Best Practices

### 1. Capture Specific Sections
Don't capture your entire application—start capture right before the code you're interested in.

```
✅ Good: Start capture → Execute feature → Stop capture
❌ Bad: Start capture → Run entire app
```

### 2. Use Breakpoints Strategically
Set breakpoints at key locations to control what gets captured.

### 3. Step Through Important Code
Use F11 (Step Into) to capture detailed flow through functions.

### 4. Stop Capture Promptly
Stop capture as soon as you've captured what you need to keep results focused.

### 5. Check Output Channel
View detailed capture logs:
```
View → Output → Select "Vibe Flow - Debug Capture"
```

## 📊 Understanding the Output

### JSON Structure

The analysis results contain:

```json
{
  "nodes": [/* All functions in your code */],
  "edges": [/* All function calls */],
  "execution": {
    "steps": [/* Each captured execution event */],
    "highlighted_nodes": [/* Functions that were executed */],
    "highlighted_edges": [/* Function calls that occurred */]
  },
  "summary": {
    "runtime_overview": "Human-readable execution summary"
  }
}
```

### Execution Steps

Each captured step includes:
- **timestamp**: When it happened
- **function**: Which function was executing
- **file**: What file it's in
- **line**: Exact line number
- **stack**: Call stack at that moment

### Example Output

```json
{
  "timestamp": "2025-12-31T10:30:45.123Z",
  "type": "function_call",
  "description": "Executing processData",
  "file": "c:\\MyProject\\src\\main.ts",
  "line": 42,
  "function": "processData",
  "stack": ["main", "handleRequest", "processData"]
}
```

## 🛠️ Supported Languages

Auto-capture works with any language that supports VS Code debugging:

| Language | Debug Type | Status |
|----------|-----------|--------|
| JavaScript/TypeScript | Node.js | ✅ Fully Supported |
| Python | Python | ✅ Fully Supported |
| Java | Java | ✅ Fully Supported |
| C# | .NET | ✅ Fully Supported |
| Go | Go | ✅ Fully Supported |
| Rust | LLDB | ✅ Fully Supported |
| C/C++ | GDB/LLDB | ✅ Fully Supported |

## 🐛 Troubleshooting

### Problem: "No active debug session"

**Solution**: Start debugging first (F5), then run the capture command.

### Problem: "No events captured"

**Possible Causes**:
1. Debugger was paused and not executing
2. Capture started but no code was stepped through

**Solution**: Make sure to step through your code (F10/F11) or continue execution (F5) after starting capture.

### Problem: Too many events captured

**Solution**: 
- Use more focused capture (start/stop around specific code)
- Set max events limit (default is 10,000)
- Use breakpoints to control execution

### Problem: Capture seems slow

**Solution**:
- This is normal—capturing execution has some overhead
- For performance testing, use the Quick Capture method
- Reduce frame depth limit if needed

## 🔧 Advanced Configuration

### Capture Options

When calling `startCapture()` programmatically:

```typescript
{
  maxEvents: 10000,        // Maximum events to capture
  captureVariables: false, // Capture variable values (slower)
  frameDepthLimit: 20      // Maximum call stack depth
}
```

### Programmatic Usage

You can use auto-capture in your own extensions:

```typescript
import { DebugFlowCapture } from './core/DebugFlowCapture';

const capture = new DebugFlowCapture();
await capture.startCapture();

// ... run your code ...

const events = await capture.stopCapture();
console.log(`Captured ${events.length} events`);
```

## 📈 Performance Tips

1. **Capture in Development Only**: Don't use in production
2. **Limit Capture Scope**: Only capture what you need
3. **Use Quick Capture**: For instant snapshots without overhead
4. **Watch Event Count**: Stop before hitting maxEvents limit

## 🎓 Tutorial: First Auto-Capture

Let's do a complete walkthrough:

### Example Code (main.ts)

```typescript
function main() {
    console.log("Starting...");
    const result = processData();
    console.log("Done:", result);
}

function processData() {
    const data = loadData();
    return transform(data);
}

function loadData() {
    return [1, 2, 3, 4, 5];
}

function transform(data: number[]) {
    return data.map(x => x * 2);
}

main();
```

### Steps

1. **Set Breakpoint**
   - Click in margin next to `function main()`

2. **Start Debugging**
   - Press F5
   - Code pauses at `main()`

3. **Start Auto-Capture**
   - Press Ctrl+Shift+P
   - Type: "Start Auto-Capture"
   - Press Enter

4. **Step Through**
   - Press F11 to step into `processData()`
   - Press F11 to step into `loadData()`
   - Press F10 to continue stepping

5. **Stop Auto-Capture**
   - Press Ctrl+Shift+P
   - Type: "Stop Auto-Capture"
   - Press Enter

6. **View Results**
   - JSON file opens automatically
   - See execution path: main → processData → loadData → transform
   - See exact line numbers and timestamps!

## 🚨 Important Notes

- **Overhead**: Capturing adds some performance overhead
- **Privacy**: Captured data stays local, never sent anywhere
- **File Size**: Large captures can create big JSON files
- **Memory**: Very long captures may use significant memory

## 🎉 Benefits Over Manual Traces

| Feature | Manual Traces | Auto-Capture |
|---------|---------------|--------------|
| Setup Time | Minutes | Seconds |
| Accuracy | Depends on instrumentation | 100% accurate |
| Completeness | Can miss calls | Captures everything |
| Ease of Use | Complex | Simple |
| Real-Time | No | Yes |

## 📚 Next Steps

1. ✅ Try the Quick Start tutorial above
2. ✅ Explore the JSON output
3. ✅ Use in your daily debugging
4. ✅ Combine with static analysis for complete picture

---

**Happy Debugging! 🎉**

Auto-Capture makes understanding code execution effortless. No more manual instrumentation, no more missing trace data—just pure, automatic flow analysis!





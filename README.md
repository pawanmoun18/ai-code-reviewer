# 🤖 AI Code Reviewer – VS Code Extension

A VS Code extension powered by **Google Gemini API** that autonomously reviews and improves your codebase using an agentic AI loop.

## ✨ Features

- 🔍 Automatically explores your project folder
- 🐛 Detects bugs in JavaScript, HTML, and CSS files
- 🔧 Auto-applies fixes without manual intervention
- 🔁 Iterative reasoning loop for multi-step code improvement
- ⚡ Real-time code analysis and refactoring

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| JavaScript | Core extension logic |
| Node.js | Runtime environment |
| VS Code Extension API | Editor integration |
| Google Gemini API | AI-powered code review |
| LLM Tool Calling | Agentic file operations |

## 🤖 How It Works

1. Extension activates inside VS Code
2. AI agent explores the project using `list_files`
3. Reads each file using `read_file`
4. Analyzes code, detects bugs and improvements
5. Automatically applies fixes using `write_file`
6. Repeats until codebase is fully reviewed

## 🚀 Getting Started
```bash
git clone https://github.com/pawanmoun18/ai-code-reviewer.git
cd ai-code-reviewer
npm install
```

Open in VS Code and press `F5` to run the extension.

## 📄 License

MIT License — feel free to use and modify.

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

// --------------- Tool Declarations for the Gemini SDK ---------------
const tools = [
    {
        functionDeclarations: [
            {
                name: "list_files",
                description:
                    "List files and directories in a given relative path within the project.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        directory: {
                            type: "STRING",
                            description:
                                "The directory path relative to the project root. Use '.' for the root.",
                        },
                    },
                    required: ["directory"],
                },
            },
            {
                name: "read_file",
                description: "Read the full contents of a file.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        file_path: {
                            type: "STRING",
                            description:
                                "The path to the file relative to the project root.",
                        },
                    },
                    required: ["file_path"],
                },
            },
            {
                name: "write_file",
                description:
                    "Overwrite a file with new content. Use this to apply code fixes.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        file_path: {
                            type: "STRING",
                            description:
                                "The path to the file relative to the project root.",
                        },
                        content: {
                            type: "STRING",
                            description: "The new content to write to the file.",
                        },
                    },
                    required: ["file_path", "content"],
                },
            },
        ],
    },
];

// --------------- Local Tool Executors ---------------

function executeListFiles(projectPath, directory) {
    const fullPath = path.resolve(projectPath, directory);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const entries = fs.readdirSync(fullPath);
        return JSON.stringify(entries);
    }
    return "Error: Directory not found or is not a directory.";
}

function executeReadFile(projectPath, filePath) {
    const fullPath = path.resolve(projectPath, filePath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fs.readFileSync(fullPath, "utf8");
    }
    return "Error: File not found or is not a file.";
}

function executeWriteFile(projectPath, filePath, content) {
    const fullPath = path.resolve(projectPath, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, "utf8");
    return "Success: File written successfully.";
}

// --------------- Main Agent Entry Point ---------------

const MAX_ITERATIONS = 25;

const SYSTEM_INSTRUCTION =
    "You are an autonomous AI code reviewer and fixer.\n" +
    "Use the available tools to explore the project, read files, fix bugs, and write improved code.\n\n" +
    "Follow this workflow:\n" +
    "1. Start by calling list_files with directory '.' to discover the project structure.\n" +
    "2. Read .js, .html, and .css source files to understand the code.\n" +
    "3. Identify bugs, performance issues, naming problems, and security vulnerabilities.\n" +
    "4. Use write_file to apply fixes directly. Be careful to preserve existing code you are not changing.\n" +
    "5. When finished, provide a final summary of everything you found and fixed.";

/**
 * Run the autonomous AI code review agent.
 *
 * @param {string} projectPath  – absolute path to the project root
 * @param {string} apiKey       – Gemini API key
 * @param {object} outputChannel – VS Code OutputChannel for logging
 * @returns {Promise<string>}   – the final report text from the model
 */
async function runAgent(projectPath, apiKey, outputChannel) {
    outputChannel.appendLine("\n🤖 Starting Autonomous AI Review Agent...");
    outputChannel.appendLine(`📂 Working Directory: ${projectPath}\n`);

    const ai = new GoogleGenAI({ apiKey });

    // Conversation history
    const messages = [
        {
            role: "user",
            parts: [
                {
                    text:
                        "Please review the project located at the current working directory. " +
                        "Explore the source files (.js, .html, .css), identify any bugs or issues, " +
                        "apply fixes using the write_file tool, and then give me a final summary report.",
                },
            ],
        },
    ];

    let iterations = 0;
    let finalResponseText = "Agent reached maximum iterations without a final response.";

    while (iterations < MAX_ITERATIONS) {
        iterations++;
        outputChannel.appendLine(`🔄 [Iteration ${iterations}] Contacting Gemini API...`);

        try {
            const result = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: messages,
                config: {
                    tools,
                    systemInstruction: SYSTEM_INSTRUCTION,
                },
            });

            // The SDK returns the candidate directly
            const parts = result.candidates?.[0]?.content?.parts;

            if (!parts || parts.length === 0) {
                outputChannel.appendLine("⚠️ Empty response from model, stopping.");
                break;
            }

            // Append the model's reply to conversation history
            messages.push({
                role: "model",
                parts,
            });

            // Separate function calls from text parts
            const functionCalls = parts.filter((p) => p.functionCall);
            const textParts = parts.filter((p) => p.text);

            if (functionCalls.length > 0) {
                // ---- Execute each tool call ----
                const functionResponses = [];

                for (const call of functionCalls) {
                    const name = call.functionCall.name;
                    const args = call.functionCall.args || {};
                    let toolResult;

                    try {
                        if (name === "list_files") {
                            outputChannel.appendLine(
                                `🛠️  Tool Call: list_files("${args.directory}")`
                            );
                            toolResult = executeListFiles(projectPath, args.directory);
                        } else if (name === "read_file") {
                            outputChannel.appendLine(
                                `🛠️  Tool Call: read_file("${args.file_path}")`
                            );
                            toolResult = executeReadFile(projectPath, args.file_path);
                        } else if (name === "write_file") {
                            outputChannel.appendLine(
                                `🛠️  Tool Call: write_file("${args.file_path}")`
                            );
                            toolResult = executeWriteFile(
                                projectPath,
                                args.file_path,
                                args.content
                            );
                        } else {
                            toolResult = `Error: Unknown tool "${name}"`;
                        }
                    } catch (err) {
                        toolResult = `Error executing tool ${name}: ${err.message}`;
                        outputChannel.appendLine(`❌ ${toolResult}`);
                    }

                    functionResponses.push({
                        functionResponse: {
                            name,
                            response: { result: toolResult },
                        },
                    });
                }

                // Send the tool results back to the model
                messages.push({
                    role: "user",
                    parts: functionResponses,
                });
            } else if (textParts.length > 0) {
                // No function calls → the model is done
                finalResponseText = textParts.map((p) => p.text).join("\n");
                outputChannel.appendLine("✅ Agent finished reviewing.");
                break;
            } else {
                outputChannel.appendLine("⚠️ Response contained neither text nor tool calls, stopping.");
                break;
            }
        } catch (error) {
            outputChannel.appendLine(`❌ Gemini API Error: ${error.message}`);
            finalResponseText = `AI review failed: ${error.message}`;
            break;
        }
    }

    if (iterations >= MAX_ITERATIONS) {
        outputChannel.appendLine(
            `⚠️ Reached maximum iteration limit (${MAX_ITERATIONS}). Stopping agent.`
        );
    }

    return finalResponseText;
}

module.exports = {
    runAgent,
};
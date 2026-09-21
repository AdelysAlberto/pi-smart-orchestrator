/**
 * Minimal & Collapsible Tool Output Renderer (Viasera Theme).
 *
 * Keeps the interactive terminal clean while providing live feedback:
 * - Collapsed mode (default): Displays single-line tool call with compact result badge (e.g. -> ✓ 14 lines).
 * - Expanded mode (Ctrl+O): Displays full stdout/stderr when explicitly requested.
 * - Safe timeouts: Bounds runaway bash commands to 90s default.
 */

import {homedir} from "node:os";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {Text} from "@earendil-works/pi-tui";

function shortenPath(filePath: string): string {
  const home = homedir();
  if (filePath.startsWith(home)) {
    return `~${filePath.slice(home.length)}`;
  }
  return filePath;
}

const toolCache = new Map<string, ReturnType<typeof createBuiltInTools>>();

function createBuiltInTools(cwd: string) {
  return {
    read: createReadTool(cwd),
    bash: createBashTool(cwd),
    edit: createEditTool(cwd),
    write: createWriteTool(cwd),
    find: createFindTool(cwd),
    grep: createGrepTool(cwd),
    ls: createLsTool(cwd),
  };
}

function getBuiltInTools(cwd: string) {
  let tools = toolCache.get(cwd);
  if (!tools) {
    tools = createBuiltInTools(cwd);
    toolCache.set(cwd, tools);
  }
  return tools;
}

export function registerCollapsibleToolRenderers(pi: ExtensionAPI): void {
  // Read Tool
  pi.registerTool({
    name: "read",
    label: "read",
    description: "Read the contents of a file.",
    parameters: getBuiltInTools(process.cwd()).read.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getBuiltInTools(ctx.cwd).read.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const path = shortenPath(args.path || "");
      let pathDisplay = path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
      if (args.offset !== undefined || args.limit !== undefined) {
        const startLine = args.offset ?? 1;
        const endLine = args.limit !== undefined ? startLine + args.limit - 1 : "";
        pathDisplay += theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
      }
      return new Text(`${theme.fg("toolTitle", theme.bold("read"))} ${pathDisplay}`, 0, 0);
    },
    renderResult(result, {expanded}, theme) {
      const textContent = result.content.find(c => c.type === "text");
      const text = textContent?.text ?? "";
      if (!expanded) {
        if (!text) return new Text("", 0, 0);
        if ((result as {isError?: boolean}).isError || text.startsWith("Error:") || text.startsWith("error:")) {
          return new Text(theme.fg("error", ` -> ✕ ${text.slice(0, 60)}`), 0, 0);
        }
        const lineCount = text.split("\n").length;
        return new Text(theme.fg("muted", ` -> ${lineCount} líneas`), 0, 0);
      }
      if (textContent?.type !== "text") return new Text("", 0, 0);
      const output = text
        .split("\n")
        .map(line => theme.fg("toolOutput", line))
        .join("\n");
      return new Text(`\n${output}`, 0, 0);
    },
  });

  // Bash Tool (with 90s safe default timeout & live result badge)
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: "Execute a bash command in the current working directory.",
    parameters: getBuiltInTools(process.cwd()).bash.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const rawParams = params as {timeout?: number};
      const boundParams = {
        ...params,
        timeout: rawParams.timeout ?? 90,
      };
      return getBuiltInTools(ctx.cwd).bash.execute(toolCallId, boundParams, signal, onUpdate);
    },
    renderCall(args, theme) {
      const command = args.command || "...";
      const timeout = args.timeout as number | undefined;
      const timeoutSuffix = timeout ? theme.fg("muted", ` (${timeout}s)`) : "";
      return new Text(theme.fg("toolTitle", theme.bold(`$ ${command}`)) + timeoutSuffix, 0, 0);
    },
    renderResult(result, {expanded}, theme) {
      const textContent = result.content.find(c => c.type === "text");
      const text = textContent?.text?.trim() ?? "";
      const isError =
        Boolean((result as {isError?: boolean}).isError) || text.startsWith("Error:") || text.startsWith("error:");

      if (!expanded) {
        if (!text) return new Text("", 0, 0);
        if (isError) {
          const firstLine = text.split("\n")[0] ?? "Error";
          return new Text(theme.fg("error", ` -> ✕ ${firstLine.slice(0, 75)}`), 0, 0);
        }
        const lineCount = text.split("\n").filter(Boolean).length;
        const countText = lineCount > 1 ? `${lineCount} líneas` : "OK";
        return new Text(theme.fg("muted", ` -> ✓ ${countText}`), 0, 0);
      }

      if (textContent?.type !== "text") return new Text("", 0, 0);
      const colorKey = isError ? "error" : "toolOutput";
      const output = text
        .split("\n")
        .map(line => theme.fg(colorKey, line))
        .join("\n");
      return new Text(`\n${output}`, 0, 0);
    },
  });

  // Write Tool
  pi.registerTool({
    name: "write",
    label: "write",
    description: "Write content to a file.",
    parameters: getBuiltInTools(process.cwd()).write.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getBuiltInTools(ctx.cwd).write.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const path = shortenPath(args.path || "");
      const pathDisplay = path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
      const lineCount = args.content ? args.content.split("\n").length : 0;
      const lineInfo = lineCount > 0 ? theme.fg("muted", ` (${lineCount} lines)`) : "";
      return new Text(`${theme.fg("toolTitle", theme.bold("write"))} ${pathDisplay}${lineInfo}`, 0, 0);
    },
    renderResult(result, {expanded}, theme) {
      const textContent = result.content.find(c => c.type === "text");
      const text = textContent?.text ?? "";
      if (!expanded) {
        if ((result as {isError?: boolean}).isError || text.startsWith("Error:") || text.startsWith("error:")) {
          return new Text(theme.fg("error", ` -> ✕ ${text.slice(0, 60)}`), 0, 0);
        }
        return new Text(theme.fg("muted", " -> ✓ guardado"), 0, 0);
      }
      if (textContent?.type === "text" && textContent.text) {
        return new Text(`\n${theme.fg("error", textContent.text)}`, 0, 0);
      }
      return new Text("", 0, 0);
    },
  });

  // Edit Tool
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: "Edit a file by replacing exact text.",
    parameters: getBuiltInTools(process.cwd()).edit.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getBuiltInTools(ctx.cwd).edit.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const path = shortenPath(args.path || "");
      const pathDisplay = path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
      return new Text(`${theme.fg("toolTitle", theme.bold("edit"))} ${pathDisplay}`, 0, 0);
    },
    renderResult(result, {expanded}, theme) {
      const textContent = result.content.find(c => c.type === "text");
      const text = textContent?.text ?? "";
      const isError =
        Boolean((result as {isError?: boolean}).isError) || text.includes("Error") || text.includes("error");

      if (!expanded) {
        if (isError) {
          return new Text(theme.fg("error", ` -> ✕ ${text.slice(0, 60)}`), 0, 0);
        }
        return new Text(theme.fg("muted", " -> ✓ aplicado"), 0, 0);
      }
      if (textContent?.type !== "text") return new Text("", 0, 0);
      const colorKey = isError ? "error" : "toolOutput";
      return new Text(`\n${theme.fg(colorKey, text)}`, 0, 0);
    },
  });

  // Find Tool
  pi.registerTool({
    name: "find",
    label: "find",
    description: "Find files by name pattern.",
    parameters: getBuiltInTools(process.cwd()).find.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getBuiltInTools(ctx.cwd).find.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const pattern = args.pattern || "";
      const path = shortenPath(args.path || ".");
      return new Text(
        `${theme.fg("toolTitle", theme.bold("find"))} ${theme.fg("accent", pattern)} ${theme.fg("toolOutput", `in ${path}`)}`,
        0,
        0
      );
    },
    renderResult(result, {expanded}, theme) {
      const textContent = result.content.find(c => c.type === "text");
      if (!expanded) {
        if (textContent?.type === "text") {
          const count = textContent.text.trim().split("\n").filter(Boolean).length;
          if (count > 0) return new Text(theme.fg("muted", ` -> ${count} archivos`), 0, 0);
        }
        return new Text("", 0, 0);
      }
      if (textContent?.type !== "text") return new Text("", 0, 0);
      const output = textContent.text
        .trim()
        .split("\n")
        .map(l => theme.fg("toolOutput", l))
        .join("\n");
      return new Text(`\n${output}`, 0, 0);
    },
  });

  // Grep Tool
  pi.registerTool({
    name: "grep",
    label: "grep",
    description: "Search file contents by regex pattern.",
    parameters: getBuiltInTools(process.cwd()).grep.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getBuiltInTools(ctx.cwd).grep.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const pattern = args.pattern || "";
      const path = shortenPath(args.path || ".");
      return new Text(
        `${theme.fg("toolTitle", theme.bold("grep"))} ${theme.fg("accent", `/${pattern}/`)} ${theme.fg("toolOutput", `in ${path}`)}`,
        0,
        0
      );
    },
    renderResult(result, {expanded}, theme) {
      const textContent = result.content.find(c => c.type === "text");
      if (!expanded) {
        if (textContent?.type === "text") {
          const count = textContent.text.trim().split("\n").filter(Boolean).length;
          if (count > 0) return new Text(theme.fg("muted", ` -> ${count} coincidencias`), 0, 0);
        }
        return new Text("", 0, 0);
      }
      if (textContent?.type !== "text") return new Text("", 0, 0);
      const output = textContent.text
        .trim()
        .split("\n")
        .map(l => theme.fg("toolOutput", l))
        .join("\n");
      return new Text(`\n${output}`, 0, 0);
    },
  });

  // Ls Tool
  pi.registerTool({
    name: "ls",
    label: "ls",
    description: "List directory contents with file sizes.",
    parameters: getBuiltInTools(process.cwd()).ls.parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getBuiltInTools(ctx.cwd).ls.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      const path = shortenPath(args.path || ".");
      return new Text(`${theme.fg("toolTitle", theme.bold("ls"))} ${theme.fg("accent", path)}`, 0, 0);
    },
    renderResult(result, {expanded}, theme) {
      const textContent = result.content.find(c => c.type === "text");
      if (!expanded) {
        if (textContent?.type === "text") {
          const count = textContent.text.trim().split("\n").filter(Boolean).length;
          if (count > 0) return new Text(theme.fg("muted", ` -> ${count} entradas`), 0, 0);
        }
        return new Text("", 0, 0);
      }
      if (textContent?.type !== "text") return new Text("", 0, 0);
      const output = textContent.text
        .trim()
        .split("\n")
        .map(l => theme.fg("toolOutput", l))
        .join("\n");
      return new Text(`\n${output}`, 0, 0);
    },
  });
}

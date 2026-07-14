import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  analyzeReactComponentDefinition,
  handleAnalyzeReactComponent,
} from "./tools/analyzeReactComponent.js";

const server = new Server(
  {
    name: "pristine-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [analyzeReactComponentDefinition],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === analyzeReactComponentDefinition.name) {
    return handleAnalyzeReactComponent(request.params.arguments);
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pristine MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

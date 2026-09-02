#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { telegramMessageInputSchema, sendTelegramMessage } from "@cwa-dev/sendkit-core";

import { registerAuthoringTools } from "./authoring-tools";
import { parseSourceWorkspaces } from "./source-workspaces";
import { createWorkflowAuthoringClient } from "./workflow-client";

const server = new McpServer({
  name: "sendkit-local",
  version: "0.0.0",
});

function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required. Configure it in your MCP client environment.");
  }

  return token;
}

server.registerTool(
  "telegram",
  {
    title: "Telegram",
    description: "Send a Telegram message.",
    inputSchema: telegramMessageInputSchema.shape,
  },
  async (input) => {
    const result = await sendTelegramMessage({
      ...input,
      botToken: getTelegramBotToken(),
    });

    return {
      content: [
        {
          type: "text",
          text: `Sent Telegram message ${result.messageId} to chat ${result.chatId}`,
        },
      ],
      structuredContent: result,
    };
  },
);

registerAuthoringTools(server, {
  client: createWorkflowAuthoringClient(),
  sourceWorkspaces: await parseSourceWorkspaces(process.env.SENDKIT_SOURCE_WORKSPACES ?? "{}"),
});

const transport = new StdioServerTransport();
await server.connect(transport);

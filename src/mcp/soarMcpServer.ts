import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  CreateAttributeInput,
  CreateLinkedAttributeInput,
  DeleteAttributeInput,
  GetActiveProjectInput,
  GetDatamapInput,
  SoarMcpCore,
  UpdateAttributeInput,
  ValidateProjectInput,
} from './soarMcpCore';
import { SOAR_MCP_TOOL_NAMES, SOAR_MCP_TOOLS } from './soarMcpTools';

type LogLevel = 'error' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  info: 1,
  debug: 2,
};

const configuredLogLevel = (process.env.SOAR_MCP_LOG_LEVEL || 'info').toLowerCase();
const activeLogLevel: LogLevel =
  configuredLogLevel === 'debug' || configuredLogLevel === 'error' ? configuredLogLevel : 'info';

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] > LOG_LEVELS[activeLogLevel]) {
    return;
  }

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta || {}),
  };

  process.stderr.write(`[soar-mcp] ${JSON.stringify(payload)}\n`);
}

function asJsonToolResult(payload: unknown, isError: boolean = false) {
  return {
    isError,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`'${fieldName}' must be a non-empty string`);
  }
  return value;
}

function asStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringOrNull(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === 'string' ? value : undefined;
}

function asBooleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asIntegerOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter(item => typeof item === 'string') as string[];
  return items.length === value.length ? items : undefined;
}

async function main() {
  log('info', 'Starting MCP server', {
    logLevel: activeLogLevel,
    workspace: process.env.SOAR_MCP_WORKSPACE || null,
  });

  const core = new SoarMcpCore();
  const server = new Server(
    {
      name: 'soar-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('debug', 'Handling ListTools request', {
      toolCount: SOAR_MCP_TOOLS.length,
      tools: SOAR_MCP_TOOLS.map(tool => tool.name),
    });

    return {
      tools: [...SOAR_MCP_TOOLS],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const startedAt = Date.now();
    const toolName = request.params.name;

    try {
      const args = asObject(request.params.arguments);
      log('info', 'Handling tool call', {
        toolName,
        argumentKeys: Object.keys(args),
      });

      switch (toolName) {
        case SOAR_MCP_TOOL_NAMES.datamapGet: {
          const input: GetDatamapInput = {
            projectFile: assertString(args.projectFile, 'projectFile'),
            rootVertexId: asStringOrUndefined(args.rootVertexId),
            maxDepth: asIntegerOrUndefined(args.maxDepth),
          };
          const result = await core.getDatamap(input);
          log('info', 'Tool call succeeded', {
            toolName,
            durationMs: Date.now() - startedAt,
          });
          return asJsonToolResult({ ok: true, result });
        }

        case SOAR_MCP_TOOL_NAMES.datamapCreateAttribute: {
          const input: CreateAttributeInput = {
            projectFile: assertString(args.projectFile, 'projectFile'),
            parentVertexId: assertString(args.parentVertexId, 'parentVertexId'),
            attributeName: assertString(args.attributeName, 'attributeName'),
            type: assertString(args.type, 'type') as CreateAttributeInput['type'],
            comment: asStringOrUndefined(args.comment),
            enumChoices: asStringArray(args.enumChoices),
          };
          const result = await core.createAttribute(input);
          log('info', 'Tool call succeeded', {
            toolName,
            durationMs: Date.now() - startedAt,
          });
          return asJsonToolResult({ ok: true, result });
        }

        case SOAR_MCP_TOOL_NAMES.datamapCreateLinkedAttribute: {
          const input: CreateLinkedAttributeInput = {
            projectFile: assertString(args.projectFile, 'projectFile'),
            parentVertexId: assertString(args.parentVertexId, 'parentVertexId'),
            attributeName: assertString(args.attributeName, 'attributeName'),
            targetVertexId: assertString(args.targetVertexId, 'targetVertexId'),
            comment: asStringOrUndefined(args.comment),
          };
          const result = await core.createLinkedAttribute(input);
          log('info', 'Tool call succeeded', {
            toolName,
            durationMs: Date.now() - startedAt,
          });
          return asJsonToolResult({ ok: true, result });
        }

        case SOAR_MCP_TOOL_NAMES.datamapUpdateAttribute: {
          const input: UpdateAttributeInput = {
            projectFile: assertString(args.projectFile, 'projectFile'),
            parentVertexId: assertString(args.parentVertexId, 'parentVertexId'),
            attributeName: assertString(args.attributeName, 'attributeName'),
            newAttributeName: asStringOrUndefined(args.newAttributeName),
            comment: asStringOrNull(args.comment),
          };
          const result = await core.updateAttribute(input);
          log('info', 'Tool call succeeded', {
            toolName,
            durationMs: Date.now() - startedAt,
          });
          return asJsonToolResult({ ok: true, result });
        }

        case SOAR_MCP_TOOL_NAMES.datamapDeleteAttribute: {
          const input: DeleteAttributeInput = {
            projectFile: assertString(args.projectFile, 'projectFile'),
            parentVertexId: assertString(args.parentVertexId, 'parentVertexId'),
            attributeName: assertString(args.attributeName, 'attributeName'),
            removeLinkOnly: asBooleanOrUndefined(args.removeLinkOnly),
          };
          const result = await core.deleteAttribute(input);
          log('info', 'Tool call succeeded', {
            toolName,
            durationMs: Date.now() - startedAt,
          });
          return asJsonToolResult({ ok: true, result });
        }

        case SOAR_MCP_TOOL_NAMES.projectValidateAgainstDatamap: {
          const input: ValidateProjectInput = {
            projectFile: assertString(args.projectFile, 'projectFile'),
          };
          const result = await core.validateProjectAgainstDatamap(input);
          log('info', 'Tool call succeeded', {
            toolName,
            durationMs: Date.now() - startedAt,
          });
          return asJsonToolResult({ ok: true, result });
        }

        case SOAR_MCP_TOOL_NAMES.projectGetActive: {
          const input: GetActiveProjectInput = {
            workspaceRoot: asStringOrUndefined(args.workspaceRoot),
          };
          const result = await core.getActiveProject(input);
          log('info', 'Tool call succeeded', {
            toolName,
            durationMs: Date.now() - startedAt,
            source: result.source,
            hasProject: result.projectFile !== null,
          });
          return asJsonToolResult({ ok: true, result });
        }

        default:
          throw new Error(`Unsupported tool: ${request.params.name}`);
      }
    } catch (error: any) {
      log('error', 'Tool call failed', {
        toolName,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });

      return asJsonToolResult(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        true
      );
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('info', 'MCP server connected to stdio transport');
}

main().catch(error => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  log('error', 'MCP server terminated with fatal error', { error: message });
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

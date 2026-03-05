import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  AddLayoutFileInput,
  AddLayoutFolderInput,
  AddLayoutImpasseOperatorInput,
  AddLayoutOperatorInput,
  CreateAttributeInput,
  CreateLinkedAttributeInput,
  DebugConnectInput,
  DebugEvalInput,
  DebugPauseInput,
  DebugRunInput,
  DebugStepInput,
  DeleteAttributeInput,
  GetActiveProjectInput,
  GetDatamapInput,
  SoarMcpCore,
  UpdateAttributeInput,
  ValidateProjectInput,
} from './soarMcpCore';
import { SOAR_MCP_TOOL_NAMES, SOAR_MCP_TOOLS } from './soarMcpTools';
import { ToolExecutionQueue } from './toolExecutionQueue';

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

const PROJECT_SCOPED_TOOL_NAMES = new Set<string>([
  SOAR_MCP_TOOL_NAMES.datamapGet,
  SOAR_MCP_TOOL_NAMES.datamapCreateAttribute,
  SOAR_MCP_TOOL_NAMES.datamapCreateLinkedAttribute,
  SOAR_MCP_TOOL_NAMES.datamapUpdateAttribute,
  SOAR_MCP_TOOL_NAMES.datamapDeleteAttribute,
  SOAR_MCP_TOOL_NAMES.projectValidateAgainstDatamap,
  SOAR_MCP_TOOL_NAMES.layoutAddOperator,
  SOAR_MCP_TOOL_NAMES.layoutAddImpasseOperator,
  SOAR_MCP_TOOL_NAMES.layoutAddFile,
  SOAR_MCP_TOOL_NAMES.layoutAddFolder,
]);

function resolveProjectQueueKey(
  toolName: string,
  args: Record<string, unknown>
): string | undefined {
  if (!PROJECT_SCOPED_TOOL_NAMES.has(toolName)) {
    return undefined;
  }

  const projectFile = asStringOrUndefined(args.projectFile);
  if (!projectFile) {
    return undefined;
  }

  return path.resolve(projectFile);
}

async function main() {
  log('info', 'Starting MCP server', {
    logLevel: activeLogLevel,
    workspace: process.env.SOAR_MCP_WORKSPACE || null,
  });

  const core = new SoarMcpCore();
  const executionQueue = new ToolExecutionQueue();
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
      const projectQueueKey = resolveProjectQueueKey(toolName, args);
      log('info', 'Handling tool call', {
        toolName,
        argumentKeys: Object.keys(args),
        projectQueueKey: projectQueueKey || null,
      });

      const executeTool = async () => {
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

          case SOAR_MCP_TOOL_NAMES.layoutAddOperator: {
            const input: AddLayoutOperatorInput = {
              projectFile: assertString(args.projectFile, 'projectFile'),
              parentNodeId: assertString(args.parentNodeId, 'parentNodeId'),
              operatorName: assertString(args.operatorName, 'operatorName'),
            };
            const result = await core.addLayoutOperator(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              nodeId: result.nodeId,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.layoutAddImpasseOperator: {
            const input: AddLayoutImpasseOperatorInput = {
              projectFile: assertString(args.projectFile, 'projectFile'),
              parentNodeId: assertString(args.parentNodeId, 'parentNodeId'),
              impasseName: assertString(
                args.impasseName,
                'impasseName'
              ) as AddLayoutImpasseOperatorInput['impasseName'],
            };
            const result = await core.addLayoutImpasseOperator(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              nodeId: result.nodeId,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.layoutAddFile: {
            const input: AddLayoutFileInput = {
              projectFile: assertString(args.projectFile, 'projectFile'),
              parentNodeId: assertString(args.parentNodeId, 'parentNodeId'),
              fileName: assertString(args.fileName, 'fileName'),
            };
            const result = await core.addLayoutFile(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              nodeId: result.nodeId,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.layoutAddFolder: {
            const input: AddLayoutFolderInput = {
              projectFile: assertString(args.projectFile, 'projectFile'),
              parentNodeId: assertString(args.parentNodeId, 'parentNodeId'),
              folderName: assertString(args.folderName, 'folderName'),
            };
            const result = await core.addLayoutFolder(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              nodeId: result.nodeId,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.agentConnect: {
            const input: DebugConnectInput = {
              host: asStringOrUndefined(args.host),
              port: asIntegerOrUndefined(args.port),
              agent: asStringOrUndefined(args.agent),
            };
            const result = await core.debugConnect(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              host: result.host,
              port: result.port,
              currentAgent: result.currentAgent,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.agentDisconnect: {
            const result = await core.debugDisconnect();
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.agentGetStatus: {
            const result = await core.debugGetStatus();
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              connected: result.connected,
              currentAgent: result.currentAgent,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.getAgents: {
            const result = await core.debugGetAgents();
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              agentCount: result.agents.length,
              currentAgent: result.currentAgent,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.agentRun: {
            const input: DebugRunInput = {
              agent: asStringOrUndefined(args.agent),
              count: asIntegerOrUndefined(args.count),
            };
            const result = await core.debugRun(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              agent: result.agent,
              command: result.command,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.agentStep: {
            const input: DebugStepInput = {
              agent: asStringOrUndefined(args.agent),
              count: asIntegerOrUndefined(args.count),
            };
            const result = await core.debugStep(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              agent: result.agent,
              count: result.count,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.agentPause: {
            const input: DebugPauseInput = {
              agent: asStringOrUndefined(args.agent),
            };
            const result = await core.debugPause(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              agent: result.agent,
            });
            return asJsonToolResult({ ok: true, result });
          }

          case SOAR_MCP_TOOL_NAMES.executeCli: {
            const input: DebugEvalInput = {
              agent: asStringOrUndefined(args.agent),
              line: assertString(args.line, 'line'),
            };
            const result = await core.debugEval(input);
            log('info', 'Tool call succeeded', {
              toolName,
              durationMs: Date.now() - startedAt,
              agent: result.agent,
            });
            return asJsonToolResult({ ok: true, result });
          }

          default:
            throw new Error(`Unsupported tool: ${request.params.name}`);
        }
      };

      if (projectQueueKey) {
        return await executionQueue.run(projectQueueKey, executeTool);
      }

      return await executeTool();
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

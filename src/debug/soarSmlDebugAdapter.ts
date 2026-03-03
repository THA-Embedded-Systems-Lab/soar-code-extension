import * as vscode from 'vscode';
import { SmlArgument, SmlSocketClient } from './smlSocketClient';

type DapMessageType = 'request' | 'response' | 'event';

interface DapProtocolMessage {
  readonly seq: number;
  readonly type: DapMessageType;
}

interface DapRequest<TArgs = unknown> extends DapProtocolMessage {
  readonly type: 'request';
  readonly command: string;
  readonly arguments?: TArgs;
}

interface DapResponse<TBody = unknown> extends DapProtocolMessage {
  readonly type: 'response';
  readonly requestSeq: number;
  readonly command: string;
  readonly success: boolean;
  readonly message?: string;
  readonly body?: TBody;
}

interface DapEvent<TBody = unknown> extends DapProtocolMessage {
  readonly type: 'event';
  readonly event: string;
  readonly body?: TBody;
}

interface SoarLaunchRequestArguments {
  readonly host?: string;
  readonly port?: number;
  readonly agent?: string;
  readonly stopOnEntry?: boolean;
  readonly printDepth?: number;
  readonly printTree?: boolean;
  readonly cwd?: string;
}

interface SmlDebugConfiguration extends vscode.DebugConfiguration {
  type: 'soar-sml';
  request: 'launch' | 'attach';
  name: string;
  host?: string;
  port?: number;
  agent?: string;
  stopOnEntry?: boolean;
  printDepth?: number;
  printTree?: boolean;
  cwd?: string;
}

interface DapStackTraceArguments {
  readonly threadId?: number;
}

interface DapEvaluateArguments {
  readonly expression?: string;
  readonly context?: string;
  readonly frameId?: number;
}

interface DapContinueArguments {
  readonly threadId?: number;
}

interface DapPauseArguments {
  readonly threadId?: number;
}

interface DapScopesArguments {
  readonly frameId?: number;
}

interface DapVariable {
  readonly name: string;
  readonly value: string;
  readonly variablesReference: number;
}

interface DapStackFrame {
  readonly id: number;
  readonly name: string;
  readonly line: number;
  readonly column: number;
}

interface DapScope {
  readonly name: string;
  readonly variablesReference: number;
  readonly expensive: boolean;
}

interface DapThread {
  readonly id: number;
  readonly name: string;
}

interface ParsedWme {
  readonly lhs: string;
  readonly attribute: string;
  readonly rhs: string;
}

interface StateSnapshot {
  readonly stateId: string;
  readonly superstateId?: string;
  readonly operatorId?: string;
}

interface FrameContext {
  readonly agentName: string;
  readonly stateId: string;
}

interface VariableReferenceContext {
  readonly kind: 'scope-wm' | 'scope-operator' | 'identifier';
  readonly agentName: string;
  readonly stateId?: string;
  readonly identifier?: string;
}

interface EvaluateContext {
  readonly agentName: string;
  readonly stateId?: string;
}

const MIN_VARIABLE_REFERENCE = 100;

export class SoarSmlDebugAdapter implements vscode.DebugAdapter {
  private readonly emitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  private readonly outputChannel = vscode.window.createOutputChannel('Soar SML Debug Adapter');
  private outgoingSeq = 1;
  private client: SmlSocketClient | undefined;
  private currentAgent = 'soar';
  private printDepth = 2;
  private printTree = true;
  private isRunning = false;
  private nextVariablesReference = MIN_VARIABLE_REFERENCE;
  private readonly agentThreadIds = new Map<string, number>();
  private readonly threadIdToAgent = new Map<number, string>();
  private readonly stateFrameIds = new Map<string, number>();
  private readonly frameIdToState = new Map<number, FrameContext>();
  private readonly variableRefByObjectKey = new Map<string, number>();
  private readonly variableContextByRef = new Map<number, VariableReferenceContext>();
  private readonly stateSnapshots = new Map<string, StateSnapshot>();
  private readonly goalStacksByAgent = new Map<string, readonly string[]>();

  public readonly onDidSendMessage = this.emitter.event;

  public dispose(): void {
    this.client?.disconnect();
    this.emitter.dispose();
    this.outputChannel.dispose();
  }

  public handleMessage(message: vscode.DebugProtocolMessage): void {
    const request = message as unknown as DapRequest;
    if (request.type !== 'request') {
      return;
    }

    void this.dispatchRequest(request);
  }

  private async dispatchRequest(request: DapRequest): Promise<void> {
    try {
      switch (request.command) {
        case 'initialize':
          this.sendResponse(request, {
            supportsConfigurationDoneRequest: true,
            supportsEvaluateForHovers: true,
            supportsInvalidatedEvent: true,
            supportsStepBack: false,
            supportsSetVariable: false,
          });
          this.sendEvent('initialized');
          return;
        case 'launch':
        case 'attach':
          await this.handleLaunch(request as DapRequest<SoarLaunchRequestArguments>);
          return;
        case 'setBreakpoints':
          this.sendResponse(request, { breakpoints: [] });
          return;
        case 'setExceptionBreakpoints':
          this.sendResponse(request, { breakpoints: [] });
          return;
        case 'configurationDone':
          this.sendResponse(request, {});
          return;
        case 'threads':
          await this.handleThreads(request);
          return;
        case 'stackTrace':
          await this.handleStackTrace(request as DapRequest<DapStackTraceArguments>);
          return;
        case 'scopes':
          await this.handleScopes(request as DapRequest<DapScopesArguments>);
          return;
        case 'variables':
          await this.handleVariables(request as DapRequest<{ variablesReference?: number }>);
          return;
        case 'continue':
          await this.handleContinue(request as DapRequest<DapContinueArguments>);
          return;
        case 'next':
        case 'stepIn':
        case 'stepOut':
          await this.handleSingleStep(request);
          return;
        case 'pause':
          await this.handlePause(request as DapRequest<DapPauseArguments>);
          return;
        case 'evaluate':
          await this.handleEvaluate(request as DapRequest<DapEvaluateArguments>);
          return;
        case 'disconnect':
          this.handleDisconnect(request);
          return;
        default:
          this.sendErrorResponse(request, `Unsupported request: ${request.command}`);
      }
    } catch (error: any) {
      this.outputChannel.appendLine(`[error] ${error.message}`);
      this.sendErrorResponse(request, error.message ?? 'Unhandled debug adapter error');
    }
  }

  private async handleLaunch(request: DapRequest<SoarLaunchRequestArguments>): Promise<void> {
    const args = request.arguments ?? {};
    const host = args.host ?? '127.0.0.1';
    const port = args.port ?? 12121;
    this.currentAgent = args.agent ?? 'soar';
    this.printDepth = Number.isFinite(args.printDepth)
      ? Math.max(0, Math.floor(args.printDepth!))
      : 2;
    this.printTree = args.printTree ?? true;

    this.client = new SmlSocketClient({
      host,
      port,
    });

    await this.client.connect();

    const versionResponse = await this.client.call('version');
    if (versionResponse.errorText) {
      throw new Error(`Kernel returned error for version: ${versionResponse.errorText}`);
    }

    this.outputChannel.appendLine(
      `[info] connected to ${host}:${port} (version=${versionResponse.result?.text ?? 'unknown'})`
    );

    this.sendResponse(request, {});
    this.isRunning = false;
    await this.refreshExecutionContext();
    this.sendStoppedEvent('entry');
  }

  private async handleThreads(request: DapRequest): Promise<void> {
    const agents = await this.getAgentList();
    if (agents.length > 0) {
      this.currentAgent = this.pickCurrentAgent(agents);
    }

    const threads: DapThread[] = agents.map(agentName => ({
      id: this.getOrCreateAgentThreadId(agentName),
      name: agentName,
    }));

    this.sendResponse(request, { threads });
  }

  private async handleStackTrace(request: DapRequest<DapStackTraceArguments>): Promise<void> {
    const agentName = await this.resolveAgentForThread(request.arguments?.threadId);
    this.currentAgent = agentName;
    const stack = await this.getGoalStackForAgent(agentName);
    const stackFrames = [...stack].reverse().map((stateId, index) => {
      const frameId = this.getOrCreateFrameId(agentName, stateId);
      const snapshot = this.stateSnapshots.get(this.buildStateKey(agentName, stateId));
      const name = snapshot?.operatorId ? `${stateId} [${snapshot.operatorId}]` : stateId;
      return {
        id: frameId,
        name,
        line: index + 1,
        column: 1,
      } satisfies DapStackFrame;
    });

    if (stackFrames.length === 0) {
      const fallbackState = await this.resolveCurrentStateId(agentName);
      if (fallbackState) {
        stackFrames.push({
          id: this.getOrCreateFrameId(agentName, fallbackState),
          name: fallbackState,
          line: 1,
          column: 1,
        });
      }
    }

    this.sendResponse(request, {
      stackFrames,
      totalFrames: stackFrames.length,
    });
  }

  private async handleVariables(
    request: DapRequest<{ variablesReference?: number }>
  ): Promise<void> {
    const reference = request.arguments?.variablesReference ?? 0;
    const context = this.variableContextByRef.get(reference);
    const variables = context ? await this.resolveVariablesForReference(context) : [];
    this.sendResponse(request, {
      variables: variables.map(variable => ({
        name: variable.name,
        value: variable.value,
        variablesReference: variable.variablesReference,
      })),
    });
  }

  private async handleScopes(request: DapRequest<DapScopesArguments>): Promise<void> {
    const frameId = request.arguments?.frameId;
    if (!frameId) {
      this.sendResponse(request, { scopes: [] });
      return;
    }

    const frame = this.frameIdToState.get(frameId);
    if (!frame) {
      this.sendResponse(request, { scopes: [] });
      return;
    }

    const wmRef = this.getOrCreateVariablesReference(
      `scope:wm:${frame.agentName}:${frame.stateId}`,
      {
        kind: 'scope-wm',
        agentName: frame.agentName,
        stateId: frame.stateId,
      }
    );
    const opRef = this.getOrCreateVariablesReference(
      `scope:operator:${frame.agentName}:${frame.stateId}`,
      {
        kind: 'scope-operator',
        agentName: frame.agentName,
        stateId: frame.stateId,
      }
    );

    const scopes: DapScope[] = [
      {
        name: 'Working Memory',
        variablesReference: wmRef,
        expensive: false,
      },
      {
        name: 'Operator',
        variablesReference: opRef,
        expensive: false,
      },
    ];

    this.sendResponse(request, {
      scopes,
    });
  }

  private async handleContinue(request: DapRequest<DapContinueArguments>): Promise<void> {
    const agentName = await this.resolveAgentForThread(request.arguments?.threadId);
    this.currentAgent = agentName;
    await this.runCmdline('run', agentName);
    this.isRunning = true;
    this.sendResponse(request, { allThreadsContinued: true });
    this.sendEvent('continued', {
      threadId: this.getOrCreateAgentThreadId(agentName),
      allThreadsContinued: true,
    });
  }

  private async handleSingleStep(request: DapRequest): Promise<void> {
    await this.runCmdline('step', this.currentAgent);
    this.isRunning = false;
    await this.refreshExecutionContext();
    this.sendResponse(request, {});
    this.sendStoppedEvent('step');
  }

  private async handlePause(request: DapRequest<DapPauseArguments>): Promise<void> {
    const agentName = await this.resolveAgentForThread(request.arguments?.threadId);
    this.currentAgent = agentName;
    if (this.isRunning) {
      await this.runCmdline('stop', agentName);
      this.isRunning = false;
    }
    await this.refreshExecutionContext();
    this.sendResponse(request, {});
    this.sendStoppedEvent('pause');
  }

  private async handleEvaluate(request: DapRequest<DapEvaluateArguments>): Promise<void> {
    await this.ensureClient();
    const expression = request.arguments?.expression?.trim();
    if (!expression) {
      this.sendResponse(request, {
        result: '',
        variablesReference: 0,
      });
      return;
    }

    const evaluationContext = this.resolveEvaluateContext(request.arguments);
    const evaluateAgent = evaluationContext.agentName;

    const context = request.arguments?.context;
    if (context === 'watch') {
      const watchResult = await this.evaluateWatchExpressionSafely(expression, evaluationContext);
      this.sendResponse(request, {
        result: watchResult.result,
        variablesReference: watchResult.variablesReference,
      });
      return;
    }

    const commandLine =
      context === 'repl'
        ? expression
        : expression.startsWith('print ')
          ? this.applyPrintOptionsToCommand(expression)
          : this.buildPrintCommand(
              await this.resolveExpressionTarget(expression, evaluationContext)
            );

    const output = await this.runCmdline(commandLine, evaluateAgent);
    this.sendResponse(request, {
      result: output,
      variablesReference: 0,
    });
  }

  private handleDisconnect(request: DapRequest): void {
    this.client?.disconnect();
    this.client = undefined;
    this.isRunning = false;
    this.clearSessionIdentityCaches();
    this.sendResponse(request, {});
    this.sendEvent('terminated');
  }

  private async runCmdline(line: string, agentOverride?: string): Promise<string> {
    await this.ensureClient();
    const targetAgent = agentOverride ?? this.currentAgent;
    const args: SmlArgument[] = [
      {
        param: 'agent',
        value: targetAgent,
      },
      {
        param: 'line',
        value: line,
      },
    ];

    const response = await this.client!.call('cmdline', args, {
      output: 'raw',
    });

    if (response.errorText) {
      throw new Error(response.errorText);
    }

    return response.result?.text ?? '';
  }

  private async ensureClient(): Promise<void> {
    if (!this.client) {
      throw new Error(
        'Debug session is not connected to a Soar kernel. Start with a launch/attach request first.'
      );
    }
  }

  private async refreshExecutionContext(): Promise<void> {
    this.clearExecutionSnapshots();

    const agents = await this.getAgentList();
    if (agents.length === 0) {
      return;
    }

    this.currentAgent = this.pickCurrentAgent(agents);
    for (const agentName of agents) {
      this.getOrCreateAgentThreadId(agentName);
      await this.getGoalStackForAgent(agentName);
    }
  }

  private extractLinkIdentifier(
    stateText: string,
    linkName: 'input-link' | 'output-link'
  ): string | undefined {
    const pattern = new RegExp(`\\^${linkName}\\s+([^\\s)]+)`, 'i');
    const match = pattern.exec(stateText);
    if (!match || match.length < 2) {
      return undefined;
    }

    return match[1]?.trim();
  }

  private extractAttributeIdentifier(text: string, attributeName: string): string | undefined {
    const pattern = new RegExp(`\\^${attributeName}\\s+([^\\s)]+)`, 'i');
    const match = pattern.exec(text);
    if (!match || match.length < 2) {
      return undefined;
    }

    return match[1]?.trim();
  }

  private async evaluateWatchExpression(
    expression: string,
    context: EvaluateContext
  ): Promise<{ result: string; variablesReference: number }> {
    const watchTarget = await this.resolveWatchTarget(expression, context);
    if (this.looksLikeIdentifier(watchTarget)) {
      const reference = this.getOrCreateIdentifierReference(context.agentName, watchTarget);
      return {
        result: watchTarget,
        variablesReference: reference,
      };
    }

    const output = await this.runCmdline(this.buildPrintCommand(watchTarget), context.agentName);
    return {
      result: output.length > 0 ? output : '<empty>',
      variablesReference: 0,
    };
  }

  private async evaluateWatchExpressionSafely(
    expression: string,
    context: EvaluateContext
  ): Promise<{ result: string; variablesReference: number }> {
    try {
      return await this.evaluateWatchExpression(expression, context);
    } catch (firstError: any) {
      this.outputChannel.appendLine(
        `[warn] watch evaluation failed for "${expression}": ${
          firstError?.message ?? String(firstError)
        }; retrying once`
      );

      await this.delay(40);

      try {
        return await this.evaluateWatchExpression(expression, context);
      } catch (secondError: any) {
        const message = secondError?.message ?? String(secondError);
        this.outputChannel.appendLine(
          `[warn] watch evaluation retry failed for "${expression}": ${message}`
        );

        return {
          result: `<unavailable: ${message}>`,
          variablesReference: 0,
        };
      }
    }
  }

  private async resolveWatchTarget(expression: string, context: EvaluateContext): Promise<string> {
    const normalized = expression.trim().toLowerCase();
    if (normalized === 'state') {
      return context.stateId ?? '<s>';
    }

    if (normalized === 'input-link' || normalized === 'output-link') {
      const stateTarget = context.stateId ?? '<s>';
      const stateText = await this.runCmdline(
        this.buildPrintCommand(stateTarget),
        context.agentName
      );
      let linkId = this.extractLinkIdentifier(
        stateText,
        normalized as 'input-link' | 'output-link'
      );
      if (!linkId) {
        const ioId = this.extractAttributeIdentifier(stateText, 'io');
        if (ioId) {
          const ioText = await this.runCmdline(this.buildPrintCommand(ioId), context.agentName);
          linkId = this.extractLinkIdentifier(ioText, normalized as 'input-link' | 'output-link');
        }
      }

      if (linkId) {
        return linkId;
      }
    }

    return expression;
  }

  private async resolveExpressionTarget(
    expression: string,
    context: EvaluateContext
  ): Promise<string> {
    return await this.resolveWatchTarget(expression, context);
  }

  private async getAgentList(): Promise<readonly string[]> {
    await this.ensureClient();
    const response = await this.client!.call('get_agent_list', [], { output: 'structured' });
    if (response.errorText) {
      throw new Error(response.errorText);
    }

    const names = response.result?.names ?? [];
    if (names.length > 0) {
      return names;
    }

    const text = response.result?.text ?? '';
    if (!text.trim()) {
      return [];
    }

    return text
      .split(/[\r\n\s,]+/)
      .map(value => value.trim())
      .filter(value => value.length > 0);
  }

  private computeDeterministicId(identity: string): number {
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index += 1) {
      hash ^= identity.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    const value = (hash >>> 0) & 0x7fffffff;
    return value === 0 ? 1 : value;
  }

  private parseWmes(output: string): ParsedWme[] {
    const wmes: ParsedWme[] = [];
    for (const rawLine of output.split(/\r?\n/)) {
      const lineMatch = rawLine.match(/^(\s*)\(([^\s]+)\s+\^([^\s]+)\s+(.+?)\)\s*$/);
      if (!lineMatch) {
        continue;
      }

      wmes.push({
        lhs: lineMatch[2],
        attribute: lineMatch[3],
        rhs: lineMatch[4],
      });
    }

    return wmes;
  }

  private async resolveVariablesForReference(
    context: VariableReferenceContext
  ): Promise<readonly DapVariable[]> {
    if (context.kind === 'scope-wm') {
      return await this.listIdentifierVariables(context.agentName, context.stateId);
    }

    if (context.kind === 'scope-operator') {
      if (!context.stateId) {
        return [];
      }

      const snapshot = await this.getStateSnapshot(context.agentName, context.stateId);
      if (!snapshot.operatorId) {
        return [];
      }

      return await this.listIdentifierVariables(context.agentName, snapshot.operatorId);
    }

    return await this.listIdentifierVariables(context.agentName, context.identifier);
  }

  private async listIdentifierVariables(
    agentName: string,
    identifier: string | undefined
  ): Promise<readonly DapVariable[]> {
    if (!identifier) {
      return [];
    }

    const command = this.applyPrintOptionsToCommand(`print ${identifier} -d 1`);
    const output = await this.runCmdline(command, agentName);
    const wmes = this.parseWmes(output).filter(wme => wme.lhs === identifier);
    return wmes.map(wme => {
      const childReference = this.looksLikeIdentifier(wme.rhs)
        ? this.getOrCreateIdentifierReference(agentName, wme.rhs)
        : 0;
      return {
        name: `^${wme.attribute}`,
        value: wme.rhs,
        variablesReference: childReference,
      };
    });
  }

  private async resolveAgentForThread(threadId?: number): Promise<string> {
    if (threadId) {
      const mappedAgent = this.threadIdToAgent.get(threadId);
      if (mappedAgent) {
        return mappedAgent;
      }
    }

    const agents = await this.getAgentList();
    if (agents.length > 0) {
      return this.pickCurrentAgent(agents);
    }

    return this.currentAgent;
  }

  private async getGoalStackForAgent(agentName: string): Promise<readonly string[]> {
    const currentState = await this.resolveCurrentStateId(agentName);
    if (!currentState) {
      this.goalStacksByAgent.set(agentName, []);
      return [];
    }

    const chain: string[] = [];
    const visited = new Set<string>();
    let nextState: string | undefined = currentState;
    while (nextState && !visited.has(nextState)) {
      visited.add(nextState);
      chain.push(nextState);
      const snapshot = await this.getStateSnapshot(agentName, nextState);
      nextState = snapshot.superstateId;
    }

    const stack = chain.reverse();
    this.goalStacksByAgent.set(agentName, stack);
    return stack;
  }

  private async resolveCurrentStateId(agentName: string): Promise<string | undefined> {
    const output = await this.runCmdline(this.buildPrintCommand('<s>'), agentName);
    const firstWme = this.parseWmes(output)[0];
    return firstWme?.lhs;
  }

  private async getStateSnapshot(agentName: string, stateId: string): Promise<StateSnapshot> {
    const stateKey = this.buildStateKey(agentName, stateId);
    const cached = this.stateSnapshots.get(stateKey);
    if (cached) {
      return cached;
    }

    const output = await this.runCmdline(
      this.applyPrintOptionsToCommand(`print ${stateId} -d 1`),
      agentName
    );
    const wmes = this.parseWmes(output).filter(wme => wme.lhs === stateId);
    const snapshot: StateSnapshot = {
      stateId,
      superstateId: wmes.find(wme => wme.attribute === 'superstate')?.rhs,
      operatorId: wmes.find(wme => wme.attribute === 'operator')?.rhs,
    };

    this.stateSnapshots.set(stateKey, snapshot);
    return snapshot;
  }

  private buildStateKey(agentName: string, stateId: string): string {
    return `${agentName}::${stateId}`;
  }

  private getOrCreateAgentThreadId(agentName: string): number {
    const existing = this.agentThreadIds.get(agentName);
    if (existing !== undefined) {
      return existing;
    }

    const threadId = this.computeDeterministicId(`thread:${agentName}`);
    this.agentThreadIds.set(agentName, threadId);
    this.threadIdToAgent.set(threadId, agentName);
    return threadId;
  }

  private getOrCreateFrameId(agentName: string, stateId: string): number {
    const stateKey = this.buildStateKey(agentName, stateId);
    const existing = this.stateFrameIds.get(stateKey);
    if (existing !== undefined) {
      return existing;
    }

    const frameId = this.computeDeterministicId(`frame:${stateKey}`);
    this.stateFrameIds.set(stateKey, frameId);
    this.frameIdToState.set(frameId, { agentName, stateId });
    return frameId;
  }

  private getOrCreateVariablesReference(
    objectKey: string,
    context: VariableReferenceContext
  ): number {
    const existing = this.variableRefByObjectKey.get(objectKey);
    if (existing !== undefined) {
      return existing;
    }

    const reference = this.nextVariablesReference;
    this.nextVariablesReference += 1;
    this.variableRefByObjectKey.set(objectKey, reference);
    this.variableContextByRef.set(reference, context);
    return reference;
  }

  private getOrCreateIdentifierReference(agentName: string, identifier: string): number {
    return this.getOrCreateVariablesReference(`id:${agentName}:${identifier}`, {
      kind: 'identifier',
      agentName,
      identifier,
    });
  }

  private looksLikeIdentifier(value: string): boolean {
    return /^[A-Z][A-Z0-9_-]*$/.test(value.trim());
  }

  private pickCurrentAgent(agents: readonly string[]): string {
    if (agents.includes(this.currentAgent)) {
      return this.currentAgent;
    }

    return agents[0];
  }

  private resolveEvaluateContext(args: DapEvaluateArguments | undefined): EvaluateContext {
    if (args?.frameId) {
      const frame = this.frameIdToState.get(args.frameId);
      if (frame) {
        return {
          agentName: frame.agentName,
          stateId: frame.stateId,
        };
      }
    }

    return {
      agentName: this.currentAgent,
    };
  }

  private clearSessionIdentityCaches(): void {
    this.agentThreadIds.clear();
    this.threadIdToAgent.clear();
    this.stateFrameIds.clear();
    this.frameIdToState.clear();
    this.variableRefByObjectKey.clear();
    this.variableContextByRef.clear();
    this.clearExecutionSnapshots();
    this.nextVariablesReference = MIN_VARIABLE_REFERENCE;
  }

  private clearExecutionSnapshots(): void {
    this.stateSnapshots.clear();
    this.goalStacksByAgent.clear();
  }

  private sendStoppedEvent(reason: 'entry' | 'step' | 'pause'): void {
    const threadId = this.getOrCreateAgentThreadId(this.currentAgent);
    this.sendEvent('stopped', {
      reason,
      threadId,
      allThreadsStopped: true,
      preserveFocusHint: false,
    });

    this.sendEvent('invalidated', {
      areas: ['all'],
      threadId,
    });
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>(resolve => {
      setTimeout(resolve, milliseconds);
    });
  }

  private buildPrintCommand(target: string): string {
    return this.applyPrintOptionsToCommand(`print ${target}`);
  }

  private applyPrintOptionsToCommand(command: string): string {
    let result = command.trim();

    if (this.printDepth >= 0 && !/\s-d\s+\d+(\s|$)/.test(result)) {
      result = `${result} -d ${this.printDepth}`;
    }

    if (this.printTree && !/\s-t(\s|$)/.test(result)) {
      result = `${result} -t`;
    }

    return result;
  }

  private sendResponse<TBody>(request: DapRequest, body: TBody): void {
    const response: DapResponse<TBody> = {
      seq: this.outgoingSeq++,
      type: 'response',
      requestSeq: request.seq,
      command: request.command,
      success: true,
      body,
    };
    const wireResponse: Record<string, unknown> = { ...response };
    wireResponse['request_seq'] = response.requestSeq;
    this.emitter.fire(wireResponse as unknown as vscode.DebugProtocolMessage);
  }

  private sendErrorResponse(request: DapRequest, message: string): void {
    const response: DapResponse = {
      seq: this.outgoingSeq++,
      type: 'response',
      requestSeq: request.seq,
      command: request.command,
      success: false,
      message,
    };
    const wireResponse: Record<string, unknown> = { ...response };
    wireResponse['request_seq'] = response.requestSeq;
    this.emitter.fire(wireResponse as unknown as vscode.DebugProtocolMessage);
  }

  private sendEvent<TBody>(event: string, body?: TBody): void {
    const payload: DapEvent<TBody> = {
      seq: this.outgoingSeq++,
      type: 'event',
      event,
      body,
    };

    this.emitter.fire(payload as unknown as vscode.DebugProtocolMessage);
  }
}

export class SoarSmlDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  public createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new SoarSmlDebugAdapter());
  }
}

export class SoarSmlDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  public resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    const resolved: SmlDebugConfiguration = {
      type: 'soar-sml',
      name: config.name ?? 'Soar SML Debug',
      request: (config.request as 'launch' | 'attach' | undefined) ?? 'launch',
      host: typeof config.host === 'string' ? config.host : '127.0.0.1',
      port: typeof config.port === 'number' ? config.port : 12121,
      agent: typeof config.agent === 'string' ? config.agent : 'soar',
      stopOnEntry: true,
      printDepth:
        typeof config.printDepth === 'number' && Number.isFinite(config.printDepth)
          ? Math.max(0, Math.floor(config.printDepth))
          : 2,
      printTree: typeof config.printTree === 'boolean' ? config.printTree : true,
      cwd: typeof config.cwd === 'string' ? config.cwd : undefined,
    };

    return resolved;
  }
}

import * as net from 'net';

export type SmlDocType = 'call' | 'response' | 'notify';

export interface SmlArgument {
  readonly param: string;
  readonly value: string;
  readonly type?: string;
}

export interface SmlResult {
  readonly output: 'raw' | 'structured' | string;
  readonly text: string;
  readonly names: readonly string[];
}

export interface SmlMessage {
  readonly doctype: SmlDocType;
  readonly id?: string;
  readonly ack?: string;
  readonly result?: SmlResult;
  readonly errorText?: string;
  readonly rawXml: string;
}

export interface SmlCallOptions {
  readonly output?: 'raw' | 'structured';
  readonly timeoutMs?: number;
}

export interface SmlClientConfig {
  readonly host: string;
  readonly port: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function encodeXmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseAttributes(tagContents: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attributeRegex.exec(tagContents)) !== null) {
    attributes[match[1]] = decodeXmlEntities(match[2]);
  }

  return attributes;
}

function extractTag(xml: string, tagName: string): { attrs: string; body: string } | undefined {
  const regex = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  if (!match) {
    return undefined;
  }
  return {
    attrs: match[1] ?? '',
    body: match[2] ?? '',
  };
}

function stripTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, '');
}

function parseSmlMessage(xml: string): SmlMessage {
  const rootMatch = xml.match(/<sml\b([^>]*)>/i);
  if (!rootMatch) {
    throw new Error(`Invalid SML message (missing <sml>): ${xml}`);
  }

  const rootAttributes = parseAttributes(rootMatch[1] ?? '');
  const doctype = rootAttributes.doctype as SmlDocType | undefined;
  if (doctype !== 'call' && doctype !== 'response' && doctype !== 'notify') {
    throw new Error(`Invalid SML doctype '${String(rootAttributes.doctype)}'`);
  }

  const resultTag = extractTag(xml, 'result');
  const errorTag = extractTag(xml, 'error');

  let result: SmlResult | undefined;
  if (resultTag) {
    const resultAttributes = parseAttributes(resultTag.attrs);
    const output = resultAttributes.output ?? 'raw';
    const names: string[] = [];
    const nameRegex = /<name\b[^>]*>([\s\S]*?)<\/name>/gi;
    let nameMatch: RegExpExecArray | null;
    while ((nameMatch = nameRegex.exec(resultTag.body)) !== null) {
      const parsed = decodeXmlEntities(stripTags(nameMatch[1] ?? '')).trim();
      if (parsed.length > 0) {
        names.push(parsed);
      }
    }

    result = {
      output,
      text: decodeXmlEntities(stripTags(resultTag.body)).trim(),
      names,
    };
  }

  const errorText = errorTag ? decodeXmlEntities(stripTags(errorTag.body)).trim() : undefined;

  return {
    doctype,
    id: rootAttributes.id,
    ack: rootAttributes.ack,
    result,
    errorText,
    rawXml: xml,
  };
}

interface PendingCall {
  readonly resolve: (value: SmlMessage) => void;
  readonly reject: (reason: unknown) => void;
  readonly timeout: NodeJS.Timeout;
}

export class SmlSocketClient {
  private readonly config: SmlClientConfig;
  private socket: net.Socket | undefined;
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private nextRequestId = 1;
  private pendingCalls = new Map<string, PendingCall>();

  public constructor(config: SmlClientConfig) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    this.socket = await new Promise<net.Socket>((resolve, reject) => {
      const socket = net.createConnection(
        {
          host: this.config.host,
          port: this.config.port,
        },
        () => resolve(socket)
      );

      const connectTimeout = setTimeout(() => {
        socket.destroy(new Error('Timed out connecting to SML socket'));
      }, DEFAULT_CONNECT_TIMEOUT_MS);

      socket.once('connect', () => {
        clearTimeout(connectTimeout);
      });

      socket.once('error', () => {
        clearTimeout(connectTimeout);
      });
      socket.once('error', reject);
    });

    this.socket.on('data', chunk => {
      this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
      this.processIncomingFrames();
    });

    this.socket.on('error', err => {
      this.failAllPending(err);
    });

    this.socket.on('close', () => {
      this.failAllPending(new Error('SML socket closed'));
      this.socket = undefined;
      this.receiveBuffer = Buffer.alloc(0);
    });
  }

  public disconnect(): void {
    this.socket?.destroy();
    this.socket = undefined;
    this.receiveBuffer = Buffer.alloc(0);
  }

  public async call(
    commandName: string,
    args: readonly SmlArgument[] = [],
    options: SmlCallOptions = {}
  ): Promise<SmlMessage> {
    if (!this.socket) {
      throw new Error('SML client is not connected');
    }

    const requestId = String(this.nextRequestId++);
    const xml = this.buildCallXml(requestId, commandName, args, options.output);
    this.sendFramedXml(xml);

    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    return await new Promise<SmlMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(requestId);
        reject(new Error(`Timed out waiting for SML ack=${requestId}`));
      }, timeoutMs);

      this.pendingCalls.set(requestId, {
        resolve,
        reject,
        timeout,
      });
    });
  }

  private buildCallXml(
    requestId: string,
    commandName: string,
    args: readonly SmlArgument[],
    output?: 'raw' | 'structured'
  ): string {
    const outputAttr = output ? ` output="${output}"` : '';
    const argXml = args
      .map(arg => {
        const typeAttr = arg.type ? ` type="${encodeXmlEntities(arg.type)}"` : '';
        return `<arg param="${encodeXmlEntities(arg.param)}"${typeAttr}>${encodeXmlEntities(
          arg.value
        )}</arg>`;
      })
      .join('');

    return `<sml doctype="call" id="${requestId}" smlversion="0.0.0"><command name="${encodeXmlEntities(
      commandName
    )}"${outputAttr}>${argXml}</command></sml>`;
  }

  private buildResponseXml(ackId: string): string {
    const responseId = String(this.nextRequestId++);
    return `<sml doctype="response" id="${responseId}" ack="${encodeXmlEntities(
      ackId
    )}" smlversion="0.0.0"></sml>`;
  }

  private sendFramedXml(xml: string): void {
    if (!this.socket) {
      throw new Error('SML client is not connected');
    }

    const payload = Buffer.from(xml, 'utf8');
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeUInt32BE(payload.length, 0);
    this.socket.write(Buffer.concat([lengthPrefix, payload]));
  }

  private processIncomingFrames(): void {
    while (this.receiveBuffer.length >= 4) {
      const payloadLength = this.receiveBuffer.readUInt32BE(0);
      if (this.receiveBuffer.length < payloadLength + 4) {
        return;
      }

      const payload = this.receiveBuffer.subarray(4, payloadLength + 4);
      this.receiveBuffer = this.receiveBuffer.subarray(payloadLength + 4);

      const xml = payload.toString('utf8');
      const message = parseSmlMessage(xml);
      this.handleIncomingMessage(message);
    }
  }

  private handleIncomingMessage(message: SmlMessage): void {
    if (message.doctype === 'response' && message.ack) {
      const pending = this.pendingCalls.get(message.ack);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      this.pendingCalls.delete(message.ack);
      pending.resolve(message);
      return;
    }

    if (message.doctype === 'call' && message.id) {
      const emptyResponse = this.buildResponseXml(message.id);
      this.sendFramedXml(emptyResponse);
    }
  }

  private failAllPending(error: Error): void {
    for (const [requestId, pending] of this.pendingCalls.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingCalls.delete(requestId);
    }
  }
}

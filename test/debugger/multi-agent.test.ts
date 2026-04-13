/**
 * Multi-agent debugger test
 *
 * Spins up a minimal in-process mock SML TCP server that simulates two
 * Soar agents ("alpha" and "beta") with distinct working-memory and IO
 * identifiers.  The SoarSmlDebugAdapter is driven through DAP messages and
 * we assert that:
 *   - both agents appear as separate DAP threads with unique thread IDs
 *   - Working Memory variables for each thread contain that agent's own
 *     state identifier
 *   - the IO Link scope resolves the correct per-agent IO identifier (not a
 *     shared hard-coded "I1"), verifying the fix for the multi-agent IO bug
 */

import * as assert from 'assert';
import * as net from 'net';
import { SoarSmlDebugAdapter } from '../../src/debug/soarSmlDebugAdapter';

// ---------------------------------------------------------------------------
// SML framing helpers
// ---------------------------------------------------------------------------

function encodeXmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function buildFrame(xml: string): Buffer {
  const payload = Buffer.from(xml, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/** Parse the first complete SML frame from `buf`, return it plus the remainder. */
function shiftFrame(
  buf: Buffer<ArrayBufferLike>
): { xml: string; rest: Buffer<ArrayBufferLike> } | undefined {
  if (buf.length < 4) {
    return undefined;
  }
  const len = buf.readUInt32BE(0);
  if (buf.length < 4 + len) {
    return undefined;
  }
  return { xml: buf.subarray(4, 4 + len).toString('utf8'), rest: buf.subarray(4 + len) };
}

/** Read the `id` attribute from an SML XML string (for ack-ing). */
function extractId(xml: string): string | undefined {
  const m = xml.match(/\bid="([^"]*)"/);
  return m ? decodeXmlEntities(m[1] ?? '') : undefined;
}

/** Read the command name from a `<command name="...">` element. */
function extractCommandName(xml: string): string | undefined {
  const m = xml.match(/<command\b[^>]*\bname="([^"]*)"/);
  return m ? decodeXmlEntities(m[1] ?? '') : undefined;
}

/** Read a `<arg param="<name>">` value. */
function extractArg(xml: string, param: string): string | undefined {
  const re = new RegExp(`<arg\\b[^>]*\\bparam="${param}"[^>]*>([\\s\\S]*?)<\\/arg>`, 'i');
  const m = xml.match(re);
  return m ? decodeXmlEntities(m[1] ?? '') : undefined;
}

// ---------------------------------------------------------------------------
// Per-agent working memory fixtures
// ---------------------------------------------------------------------------

/**
 * Working memory returned by `print <s> -d 1 -t` for each agent.
 * Each agent has a distinct top-state id and IO identifier.
 */
const AGENT_WM: Record<string, { stateId: string; ioId: string }> = {
  alpha: { stateId: 'S1', ioId: 'I2' },
  beta: { stateId: 'S3', ioId: 'I4' },
};

function buildStateWme(agent: string): string {
  const wm = AGENT_WM[agent];
  if (!wm) {
    return '';
  }
  // Minimal WME lines that the adapter parses:
  //   (S1 ^superstate nil)
  //   (S1 ^io I2)
  //   (S1 ^type state)
  return [
    `(${wm.stateId} ^superstate nil)`,
    `(${wm.stateId} ^io ${wm.ioId})`,
    `(${wm.stateId} ^type state)`,
  ].join('\n');
}

function buildIoWme(agent: string): string {
  const wm = AGENT_WM[agent];
  if (!wm) {
    return '';
  }
  return [`(${wm.ioId} ^input-link ${wm.ioId}I)`, `(${wm.ioId} ^output-link ${wm.ioId}O)`].join(
    '\n'
  );
}

// ---------------------------------------------------------------------------
// Minimal mock SML server
// ---------------------------------------------------------------------------

interface MockServer {
  port: number;
  close(): Promise<void>;
}

async function startMockSmlServer(): Promise<MockServer> {
  const server = net.createServer(socket => {
    let buf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let seqId = 100;

    function sendResponse(ackId: string, text: string): void {
      const escapedText = encodeXmlEntities(text);
      const id = String(seqId++);
      const xmlEncoded =
        `<sml doctype="response" id="${id}" ack="${ackId}" smlversion="0.0.0">` +
        `<result output="raw">${escapedText}</result>` +
        `</sml>`;
      socket.write(buildFrame(xmlEncoded));
    }

    function sendStructuredResponse(ackId: string, names: string[]): void {
      const id = String(seqId++);
      const nameXml = names.map(n => `<name>${encodeXmlEntities(n)}</name>`).join('');
      const xml =
        `<sml doctype="response" id="${id}" ack="${ackId}" smlversion="0.0.0">` +
        `<result output="structured">${nameXml}</result>` +
        `</sml>`;
      socket.write(buildFrame(xml));
    }

    function dispatch(xml: string): void {
      const msgId = extractId(xml);
      if (!msgId) {
        return;
      }

      // Handle inbound calls from client
      if (!xml.includes('doctype="call"')) {
        return;
      }

      const command = extractCommandName(xml);

      if (command === 'version') {
        sendResponse(msgId, 'Soar Mock 9.9.0');
        return;
      }

      if (command === 'get_agent_list') {
        sendStructuredResponse(msgId, ['alpha', 'beta']);
        return;
      }

      if (command === 'cmdline') {
        const agent = extractArg(xml, 'agent') ?? 'alpha';
        const line = extractArg(xml, 'line') ?? '';

        // print <s> or print S<n> (with optional flags) → state WMEs
        if (/^print\s+(<s>|S\d+)(\s|$)/.test(line)) {
          sendResponse(msgId, buildStateWme(agent));
          return;
        }

        // print I<n> (with optional flags) → IO WMEs
        const wm = AGENT_WM[agent];
        if (wm && new RegExp(`^print\\s+${wm.ioId}(\\s|$)`).test(line)) {
          sendResponse(msgId, buildIoWme(agent));
          return;
        }

        // Fallback: return empty output
        sendResponse(msgId, '');
        return;
      }

      // Unknown command: empty response
      sendResponse(msgId, '');
    }

    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      let frame = shiftFrame(buf);
      while (frame) {
        buf = frame.rest;
        dispatch(frame.xml);
        frame = shiftFrame(buf);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as net.AddressInfo).port;

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}

// ---------------------------------------------------------------------------
// DAP driver helpers
// ---------------------------------------------------------------------------

interface DapMessage {
  type: string;
  event?: string;
  command?: string;
  success?: boolean;
  body?: Record<string, unknown>;
}

/**
 * Wraps a SoarSmlDebugAdapter and lets tests send requests and collect
 * responses / events synchronously via Promise.
 */
class DapDriver {
  private seq = 1;
  private readonly pending = new Map<
    number,
    { resolve: (msg: DapMessage) => void; reject: (err: Error) => void }
  >();
  private readonly events: DapMessage[] = [];
  public readonly adapter: SoarSmlDebugAdapter;

  constructor() {
    this.adapter = new SoarSmlDebugAdapter();
    this.adapter.onDidSendMessage(raw => {
      const msg = raw as unknown as DapMessage;
      if (msg.type === 'response') {
        const seq = (raw as any).request_seq as number | undefined;
        if (seq !== undefined) {
          const p = this.pending.get(seq);
          if (p) {
            this.pending.delete(seq);
            p.resolve(msg);
            return;
          }
        }
      }
      this.events.push(msg);
    });
  }

  /** Send a DAP request and await its response. */
  send(command: string, args?: Record<string, unknown>): Promise<DapMessage> {
    const seq = this.seq++;
    return new Promise<DapMessage>((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });
      this.adapter.handleMessage({
        seq,
        type: 'request',
        command,
        arguments: args,
      } as any);
    });
  }

  /** Collect all events of the given type that have arrived so far. */
  drainEvents(eventName: string): DapMessage[] {
    const matching = this.events.filter(e => e.type === 'event' && e.event === eventName);
    matching.forEach(e => this.events.splice(this.events.indexOf(e), 1));
    return matching;
  }

  dispose(): void {
    this.adapter.dispose();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('Debugger – multiple agents', () => {
  let mockServer: MockServer;
  let driver: DapDriver;

  setup(async () => {
    mockServer = await startMockSmlServer();
    driver = new DapDriver();

    // Initialize the DAP session
    const initResp = await driver.send('initialize', {
      adapterID: 'soar-sml',
      clientName: 'test',
    });
    assert.strictEqual(initResp.success, true, 'initialize should succeed');

    // Launch (connect to mock kernel)
    const launchResp = await driver.send('launch', {
      host: '127.0.0.1',
      port: mockServer.port,
      agent: 'alpha',
      printDepth: 1,
      printTree: true,
    });
    assert.strictEqual(launchResp.success, true, `launch failed: ${launchResp.body?.message}`);
  });

  teardown(async () => {
    driver.dispose();
    await mockServer.close();
  });

  // -----------------------------------------------------------------------
  test('Returns two distinct threads, one per agent', async () => {
    const resp = await driver.send('threads');
    assert.strictEqual(resp.success, true);

    const threads = resp.body?.threads as Array<{ id: number; name: string }>;
    assert.ok(Array.isArray(threads), 'body.threads should be an array');
    assert.strictEqual(threads.length, 2, 'expected exactly two threads (alpha + beta)');

    const names = threads.map(t => t.name).sort();
    assert.deepStrictEqual(names, ['alpha', 'beta'], 'thread names should match agent names');

    const ids = threads.map(t => t.id);
    assert.notStrictEqual(ids[0], ids[1], 'each agent must have a unique thread ID');
  });

  // -----------------------------------------------------------------------
  test('Stack trace for alpha thread identifies alpha state ID', async () => {
    const threadsResp = await driver.send('threads');
    const threads = threadsResp.body?.threads as Array<{ id: number; name: string }>;
    const alphaThread = threads.find(t => t.name === 'alpha');
    assert.ok(alphaThread, 'alpha thread not found');

    const stResp = await driver.send('stackTrace', { threadId: alphaThread.id });
    assert.strictEqual(stResp.success, true);

    const frames = stResp.body?.stackFrames as Array<{ id: number; name: string }>;
    assert.ok(frames.length > 0, 'alpha should have at least one stack frame');
    // The frame name contains the state identifier (e.g. "S1" for alpha)
    const frameNames = frames.map(f => f.name).join(' ');
    assert.ok(
      frameNames.includes(AGENT_WM.alpha.stateId),
      `alpha stack frame should reference state ${AGENT_WM.alpha.stateId}, got: ${frameNames}`
    );
  });

  // -----------------------------------------------------------------------
  test('Stack trace for beta thread identifies beta state ID', async () => {
    const threadsResp = await driver.send('threads');
    const threads = threadsResp.body?.threads as Array<{ id: number; name: string }>;
    const betaThread = threads.find(t => t.name === 'beta');
    assert.ok(betaThread, 'beta thread not found');

    const stResp = await driver.send('stackTrace', { threadId: betaThread.id });
    assert.strictEqual(stResp.success, true);

    const frames = stResp.body?.stackFrames as Array<{ id: number; name: string }>;
    assert.ok(frames.length > 0, 'beta should have at least one stack frame');
    const frameNames = frames.map(f => f.name).join(' ');
    assert.ok(
      frameNames.includes(AGENT_WM.beta.stateId),
      `beta stack frame should reference state ${AGENT_WM.beta.stateId}, got: ${frameNames}`
    );
  });

  // -----------------------------------------------------------------------
  test('Working Memory scope for alpha frame returns alpha state WMEs', async () => {
    const threadsResp = await driver.send('threads');
    const threads = threadsResp.body?.threads as Array<{ id: number; name: string }>;
    const alphaThread = threads.find(t => t.name === 'alpha')!;

    const stResp = await driver.send('stackTrace', { threadId: alphaThread.id });
    const frames = stResp.body?.stackFrames as Array<{ id: number; name: string }>;
    // index 0 is the innermost (current) frame; DAP returns current→root order
    const topFrame = frames[0];

    const scopesResp = await driver.send('scopes', { frameId: topFrame.id });
    assert.strictEqual(scopesResp.success, true);
    const scopes = scopesResp.body?.scopes as Array<{ name: string; variablesReference: number }>;

    const wmScope = scopes.find(s => s.name === 'Working Memory');
    assert.ok(wmScope, 'Working Memory scope should exist');
    assert.ok(wmScope.variablesReference > 0, 'WM scope should have non-zero variablesReference');

    const varsResp = await driver.send('variables', {
      variablesReference: wmScope.variablesReference,
    });
    assert.strictEqual(varsResp.success, true);
    const vars = varsResp.body?.variables as Array<{ name: string; value: string }>;

    // Alpha's top-state is S1; its WM should contain ^io I2 and ^superstate nil
    const ioVar = vars.find(v => v.name === '^io');
    assert.ok(
      ioVar,
      `alpha WM should have ^io attribute, got: ${vars.map(v => v.name).join(', ')}`
    );
    assert.strictEqual(
      ioVar.value,
      AGENT_WM.alpha.ioId,
      `alpha WM ^io should be ${AGENT_WM.alpha.ioId}`
    );
  });

  // -----------------------------------------------------------------------
  test('Working Memory scope for beta frame returns beta state WMEs, not alpha', async () => {
    const threadsResp = await driver.send('threads');
    const threads = threadsResp.body?.threads as Array<{ id: number; name: string }>;
    const betaThread = threads.find(t => t.name === 'beta')!;

    const stResp = await driver.send('stackTrace', { threadId: betaThread.id });
    const frames = stResp.body?.stackFrames as Array<{ id: number; name: string }>;
    // index 0 is the innermost (current) frame
    const topFrame = frames[0];

    const scopesResp = await driver.send('scopes', { frameId: topFrame.id });
    const scopes = scopesResp.body?.scopes as Array<{ name: string; variablesReference: number }>;

    const wmScope = scopes.find(s => s.name === 'Working Memory')!;
    const varsResp = await driver.send('variables', {
      variablesReference: wmScope.variablesReference,
    });
    const vars = varsResp.body?.variables as Array<{ name: string; value: string }>;

    const ioVar = vars.find(v => v.name === '^io');
    assert.ok(ioVar, `beta WM should have ^io attribute, got: ${vars.map(v => v.name).join(', ')}`);
    assert.strictEqual(
      ioVar.value,
      AGENT_WM.beta.ioId,
      `beta WM ^io should be ${AGENT_WM.beta.ioId}`
    );
    // Confirm it is NOT alpha's IO id
    assert.notStrictEqual(
      ioVar.value,
      AGENT_WM.alpha.ioId,
      'beta WM ^io must not return alpha IO id'
    );
  });

  // -----------------------------------------------------------------------
  test('IO Link scope for alpha frame resolves alpha IO identifier', async () => {
    const threadsResp = await driver.send('threads');
    const threads = threadsResp.body?.threads as Array<{ id: number; name: string }>;
    const alphaThread = threads.find(t => t.name === 'alpha')!;

    const stResp = await driver.send('stackTrace', { threadId: alphaThread.id });
    const frames = stResp.body?.stackFrames as Array<{ id: number; name: string }>;
    // index 0 is the innermost (current) frame
    const topFrame = frames[0];

    const scopesResp = await driver.send('scopes', { frameId: topFrame.id });
    const scopes = scopesResp.body?.scopes as Array<{ name: string; variablesReference: number }>;

    const ioScope = scopes.find(s => s.name === 'IO Link');
    assert.ok(ioScope, 'IO Link scope should exist');

    const varsResp = await driver.send('variables', {
      variablesReference: ioScope.variablesReference,
    });
    assert.strictEqual(varsResp.success, true);
    const vars = varsResp.body?.variables as Array<{ name: string; value: string }>;

    // Alpha's IO identifier is I2; the mock returns ^input-link I2I and ^output-link I2O
    assert.ok(vars.length > 0, 'alpha IO scope should return WMEs');
    const inputLink = vars.find(v => v.name === '^input-link');
    assert.ok(
      inputLink,
      `alpha IO scope should contain ^input-link, got: ${vars.map(v => v.name).join(', ')}`
    );
    assert.strictEqual(
      inputLink.value,
      `${AGENT_WM.alpha.ioId}I`,
      `alpha ^input-link should point to ${AGENT_WM.alpha.ioId}I`
    );
  });

  // -----------------------------------------------------------------------
  test('IO Link scope for beta frame resolves beta IO identifier, not alpha I1/I2', async () => {
    const threadsResp = await driver.send('threads');
    const threads = threadsResp.body?.threads as Array<{ id: number; name: string }>;
    const betaThread = threads.find(t => t.name === 'beta')!;

    const stResp = await driver.send('stackTrace', { threadId: betaThread.id });
    const frames = stResp.body?.stackFrames as Array<{ id: number; name: string }>;
    // index 0 is the innermost (current) frame
    const topFrame = frames[0];

    const scopesResp = await driver.send('scopes', { frameId: topFrame.id });
    const scopes = scopesResp.body?.scopes as Array<{ name: string; variablesReference: number }>;

    const ioScope = scopes.find(s => s.name === 'IO Link')!;
    const varsResp = await driver.send('variables', {
      variablesReference: ioScope.variablesReference,
    });
    const vars = varsResp.body?.variables as Array<{ name: string; value: string }>;

    assert.ok(vars.length > 0, 'beta IO scope should return WMEs');
    const inputLink = vars.find(v => v.name === '^input-link');
    assert.ok(
      inputLink,
      `beta IO scope should contain ^input-link, got: ${vars.map(v => v.name).join(', ')}`
    );
    assert.strictEqual(
      inputLink.value,
      `${AGENT_WM.beta.ioId}I`,
      `beta ^input-link should point to ${AGENT_WM.beta.ioId}I`
    );
    // The pre-fix bug would have returned alpha's I2 IO (or the fallback I1)
    assert.notStrictEqual(
      inputLink.value,
      `${AGENT_WM.alpha.ioId}I`,
      'beta IO Link must not return alpha IO data'
    );
  });
});

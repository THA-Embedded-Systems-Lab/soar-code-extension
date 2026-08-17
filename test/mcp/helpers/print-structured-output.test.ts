import * as assert from 'assert';
import * as net from 'net';
import { SoarMcpCore } from '../../../src/mcp/soarMcpCore.js';

// Minimal fake SML kernel: implements the 4-byte length-framed XML protocol
// used by SmlSocketClient, just enough to exercise agent_runtime_connect and
// a `cmdline print` call with output="structured".
//
// The structured print fixture below mirrors real kernel output: a nested
// <id id="S1"> element containing one <wme .../> per augmentation (only
// valtype="id" WMEs represent identifiers worth surfacing), plus an
// <arg param="message"> holding the human-readable rendering of the same WMEs.
const STRUCTURED_PRINT_RESULT =
  '<result>' +
  '<id id="S1">' +
  '<wme attr="epmem" id="S1" tag="4" valtype="id" value="E1" />' +
  '<wme attr="io" id="S1" tag="11" valtype="id" value="I1" />' +
  '<wme attr="probe-attr" id="S1" tag="15" valtype="string" value="probe-value" />' +
  '<wme attr="probe-attr" id="S1" tag="14" valtype="string" value="probe-value" />' +
  '<wme attr="reward-link" id="S1" tag="3" valtype="id" value="R1" />' +
  '<wme attr="smem" id="S1" tag="8" valtype="id" value="L1" />' +
  '<wme attr="superstate" id="S1" tag="2" valtype="string" value="nil" />' +
  '<wme attr="type" id="S1" tag="1" valtype="string" value="state" />' +
  '</id>' +
  '<arg param="message" type="string">(S1 ^epmem E1 ^io I1 ^probe-attr probe-value ^probe-attr probe-value ' +
  '^reward-link R1 ^smem L1 ^superstate nil ^type state)</arg>' +
  '</result>';

const RAW_PRINT_RESULT =
  '<result output="raw">(S1 ^epmem E1 ^io I1 ^probe-attr probe-value ^probe-attr probe-value ' +
  '^reward-link R1 ^smem L1 ^superstate nil ^type state)</result>';

function startFakeKernel(): Promise<{ server: net.Server; port: number }> {
  return new Promise(resolve => {
    const server = net.createServer(socket => {
      let buffer = Buffer.alloc(0);

      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 4) {
          const length = buffer.readUInt32BE(0);
          if (buffer.length < length + 4) {
            return;
          }
          const xml = buffer.subarray(4, length + 4).toString('utf8');
          buffer = buffer.subarray(length + 4);
          handleRequest(socket, xml);
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

function sendFramed(socket: net.Socket, xml: string): void {
  const payload = Buffer.from(xml, 'utf8');
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32BE(payload.length, 0);
  socket.write(Buffer.concat([lengthPrefix, payload]));
}

function handleRequest(socket: net.Socket, xml: string): void {
  const idMatch = xml.match(/\bid="(\d+)"/);
  const requestId = idMatch ? idMatch[1] : '0';
  const nameMatch = xml.match(/<command name="([^"]+)"/);
  const commandName = nameMatch ? nameMatch[1] : '';
  const outputMatch = xml.match(/\boutput="([^"]+)"/);
  const output = outputMatch ? outputMatch[1] : 'raw';
  const lineMatch = xml.match(/<arg param="line">([^<]*)<\/arg>/);
  const line = lineMatch ? lineMatch[1] : '';

  let resultXml: string;

  if (commandName === 'version') {
    resultXml = `<result output="raw">fake-kernel-1.0</result>`;
  } else if (commandName === 'get_agent_list') {
    resultXml = `<result output="structured"><name>soar1</name></result>`;
  } else if (commandName === 'cmdline' && line.startsWith('print')) {
    resultXml = output === 'structured' ? STRUCTURED_PRINT_RESULT : RAW_PRINT_RESULT;
  } else {
    resultXml = `<result output="raw"></result>`;
  }

  const responseXml = `<sml doctype="response" id="${requestId}" ack="${requestId}" smlversion="0.0.0">${resultXml}</sml>`;
  sendFramed(socket, responseXml);
}

suite('MCP CLI Print Structured Output', () => {
  let server: net.Server;
  let port: number;

  setup(async () => {
    const fake = await startFakeKernel();
    server = fake.server;
    port = fake.port;
  });

  teardown(() => {
    server.close();
  });

  test('Should return names array by default (structured output is the default)', async () => {
    const core = new SoarMcpCore();
    await core.debugConnect({ host: '127.0.0.1', port });

    const result = await core.debugEval({
      line: 'print S1 --depth 2',
    });

    // The reconstructed text should read like plain `print` output ...
    assert.strictEqual(
      result.output,
      '(S1 ^epmem E1 ^io I1 ^probe-attr probe-value ^probe-attr probe-value ' +
        '^reward-link R1 ^smem L1 ^superstate nil ^type state)'
    );
    // ... while `names` surfaces only the identifier-valued WMEs (S1 itself,
    // plus every valtype="id" value), deduplicated, and skips string-valued
    // attributes like ^probe-attr/^superstate/^type entirely.
    assert.deepStrictEqual(result.names, ['S1', 'E1', 'I1', 'R1', 'L1']);

    await core.debugDisconnect();
  });

  test('Should omit names when structuredOutput is explicitly false', async () => {
    const core = new SoarMcpCore();
    await core.debugConnect({ host: '127.0.0.1', port });

    const result = await core.debugEval({
      line: 'print S1 --depth 2',
      structuredOutput: false,
    });

    assert.strictEqual(
      result.output,
      '(S1 ^epmem E1 ^io I1 ^probe-attr probe-value ^probe-attr probe-value ' +
        '^reward-link R1 ^smem L1 ^superstate nil ^type state)'
    );
    assert.strictEqual(result.names, undefined);

    await core.debugDisconnect();
  });
});

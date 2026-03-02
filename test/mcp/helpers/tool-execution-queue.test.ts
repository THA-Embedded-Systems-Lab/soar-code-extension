import * as assert from 'assert';
import { ToolExecutionQueue } from '../../../src/mcp/toolExecutionQueue';

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

suite('MCP Tool Execution Queue', () => {
  test('Serializes operations for same key', async () => {
    const queue = new ToolExecutionQueue();
    const order: string[] = [];

    const first = queue.run('same-project', async () => {
      order.push('first-start');
      await wait(30);
      order.push('first-end');
      return 'first';
    });

    const second = queue.run('same-project', async () => {
      order.push('second-start');
      await wait(5);
      order.push('second-end');
      return 'second';
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.strictEqual(firstResult, 'first');
    assert.strictEqual(secondResult, 'second');
    assert.deepStrictEqual(order, ['first-start', 'first-end', 'second-start', 'second-end']);
    assert.strictEqual(queue.getPendingKeyCount(), 0);
  });

  test('Allows concurrent operations for different keys', async () => {
    const queue = new ToolExecutionQueue();
    const timeline: string[] = [];

    const one = queue.run('project-a', async () => {
      timeline.push('a-start');
      await wait(20);
      timeline.push('a-end');
    });

    const two = queue.run('project-b', async () => {
      timeline.push('b-start');
      await wait(20);
      timeline.push('b-end');
    });

    await Promise.all([one, two]);

    assert.strictEqual(timeline[0], 'a-start');
    assert.strictEqual(timeline[1], 'b-start');
    assert.ok(timeline.includes('a-end'));
    assert.ok(timeline.includes('b-end'));
    assert.strictEqual(queue.getPendingKeyCount(), 0);
  });

  test('Continues queue after failure', async () => {
    const queue = new ToolExecutionQueue();
    const checkpoints: string[] = [];

    await assert.rejects(
      queue.run('same-project', async () => {
        checkpoints.push('first');
        throw new Error('boom');
      })
    );

    const second = await queue.run('same-project', async () => {
      checkpoints.push('second');
      return 'ok';
    });

    assert.strictEqual(second, 'ok');
    assert.deepStrictEqual(checkpoints, ['first', 'second']);
    assert.strictEqual(queue.getPendingKeyCount(), 0);
  });
});

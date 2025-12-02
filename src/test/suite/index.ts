import * as path from 'path';
import { glob } from 'glob';

// eslint-disable-next-line @typescript-eslint/naming-convention
const Mocha = require('mocha');

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise((resolve, reject) => {
        glob('**/**.test.js', { cwd: testsRoot }).then((files: string[]) => {
            files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                mocha.run((failures: number) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err: any) {
                reject(err);
            }
        }).catch((err: any) => {
            reject(err);
        });
    });
}

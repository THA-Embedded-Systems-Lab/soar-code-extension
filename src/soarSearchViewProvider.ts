import * as vscode from 'vscode';
import { DatamapTreeProvider } from './datamap/datamapTreeProvider';
import { LayoutTreeProvider } from './layout/layoutTreeProvider';

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/**
 * A single persistent search field rendered as a compact webview view at the
 * bottom of the Soar sidebar. Its text filters BOTH the Project Structure
 * (layout) and Datamap trees at once. Unlike `showInputBox`, this keeps keyboard
 * focus inside the sidebar (the input box popup steals focus and closes on
 * blur), so the user can type-filter while still interacting with the trees.
 */
export class SoarSearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'soarSearch';

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly datamapProvider: DatamapTreeProvider,
    private readonly layoutProvider: LayoutTreeProvider
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(this.datamapProvider.searchFilter);

    webviewView.webview.onDidReceiveMessage(async (message: { type: string; value?: string }) => {
      if (message.type === 'search') {
        const value = message.value ?? '';
        this.datamapProvider.setSearchFilter(value);
        this.layoutProvider.setSearchFilter(value);
        const active = value.trim().length > 0;
        await vscode.commands.executeCommand('setContext', 'soar.datamapSearchActive', active);
        await vscode.commands.executeCommand('setContext', 'soar.layoutSearchActive', active);
      }
    });
  }

  private getHtml(initialValue: string): string {
    const escaped = initialValue.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const nonce = getNonce();
    const cspSource = this.view?.webview.cspSource ?? '';
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { padding: 4px 6px; margin: 0; }
  .row { display: flex; align-items: center; gap: 4px; }
  input {
    flex: 1;
    box-sizing: border-box;
    padding: 3px 6px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    outline: none;
  }
  input:focus { border-color: var(--vscode-focusBorder); }
  button {
    color: var(--vscode-icon-foreground);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    font-size: 13px;
    line-height: 1;
  }
  button:hover { color: var(--vscode-foreground); }
</style>
</head>
<body>
  <div class="row">
    <input id="q" type="text" placeholder="Search project structure & datamap…" value="${escaped}" />
    <button id="clear" title="Clear search">✕</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('q');
    const clear = document.getElementById('clear');
    let timer;
    function send(value) {
      vscode.postMessage({ type: 'search', value });
    }
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => send(input.value), 150);
    });
    clear.addEventListener('click', () => {
      input.value = '';
      input.focus();
      send('');
    });
  </script>
</body>
</html>`;
  }
}

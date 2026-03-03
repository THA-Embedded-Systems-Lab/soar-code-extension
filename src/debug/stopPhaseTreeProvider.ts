import * as vscode from 'vscode';

const STOP_PHASES = ['input', 'proposal', 'decision', 'apply', 'output'] as const;
export type StopPhase = (typeof STOP_PHASES)[number];

export function parseStopPhaseText(output: string | undefined): StopPhase | undefined {
  if (!output) {
    return undefined;
  }

  const normalized = output.trim().toLowerCase();
  const match = /stop\s+before\s+(input|proposal|decision|apply|output)/i.exec(normalized);
  if (!match || !match[1]) {
    return undefined;
  }

  return match[1] as StopPhase;
}

export class StopPhaseTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly phase: StopPhase,
    public readonly isSelected: boolean
  ) {
    super(phase, vscode.TreeItemCollapsibleState.None);

    this.contextValue = 'stop-phase-item';
    this.description = isSelected ? 'active' : undefined;
    this.iconPath = isSelected
      ? new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('circle-outline');
    this.command = {
      command: 'soar.setStopPhase',
      title: 'Set Stop Phase',
      arguments: [phase],
    };
    this.tooltip = `Set Soar stop phase to '${phase}'`;
  }
}

export class StopPhaseTreeProvider implements vscode.TreeDataProvider<StopPhaseTreeItem> {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    StopPhaseTreeItem | undefined | null | void
  >();
  public readonly onDidChangeTreeData = this.onDidChangeEmitter.event;

  private selectedPhase: StopPhase = 'apply';

  public refresh(): void {
    this.onDidChangeEmitter.fire();
  }

  public getSelectedPhase(): StopPhase {
    return this.selectedPhase;
  }

  public setSelectedPhase(phase: StopPhase): void {
    this.selectedPhase = phase;
    this.refresh();
  }

  public getTreeItem(element: StopPhaseTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): Thenable<StopPhaseTreeItem[]> {
    return Promise.resolve(
      STOP_PHASES.map(phase => new StopPhaseTreeItem(phase, phase === this.selectedPhase))
    );
  }
}

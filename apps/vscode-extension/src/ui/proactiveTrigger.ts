// A tiny event bus so capture modules (e.g. terminal.ts) can notify
// proactiveContext.ts of a trigger-worthy event (spec §11.3: "terminal
// command failure") without a direct import cycle between them.

import * as vscode from "vscode";

export class ProactiveTrigger {
  private readonly emitter = new vscode.EventEmitter<string>();
  readonly onTerminalFailure = this.emitter.event;

  notifyTerminalFailure(errorText: string): void {
    this.emitter.fire(errorText);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

import * as vscode from 'vscode';
import ConnectionController, {
  DataServiceEventTypes,
  ConnectionTypes
} from '../connectionController';
import TelemetryController from '../telemetry/telemetryController';
import {
  INITIAL_WEBVIEW_VIEW_GLOBAL_VARNAME,
  MESSAGE_FROM_WEBVIEW_TO_EXTENSION,
  MESSAGE_TYPES,
  WEBVIEW_VIEWS
} from './webview-app/extension-app-message-constants';
import { createLogger } from '../logging';
import EXTENSION_COMMANDS from '../commands';

const path = require('path');
const log = createLogger('webviewController');

const openFileOptions = {
  canSelectFiles: true,
  canSelectFolders: false,
  canSelectMany: false, // Can be overridden.
  openLabel: 'Open',
  filters: {
    'All files': ['*']
  }
};

export const getReactAppUri = (
  extensionPath: string,
  webview: vscode.Webview
): vscode.Uri => {
  const localFilePathUri = vscode.Uri.file(
    path.join(extensionPath, 'dist', 'webviewApp.js')
  );
  const jsAppFileWebviewUri = webview.asWebviewUri(localFilePathUri);
  return jsAppFileWebviewUri;
};

export const getWebviewContent = (
  extensionPath: string,
  webview: vscode.Webview,
  view: WEBVIEW_VIEWS
): string => {
  const jsAppFileUrl = getReactAppUri(extensionPath, webview);

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MongoDB</title>
    </head>
    <body>
      <div id="root"></div>
      <script>window['${INITIAL_WEBVIEW_VIEW_GLOBAL_VARNAME}'] = '${view}';</script>
      <script src="${jsAppFileUrl}"></script>
    </body>
  </html>`;
};

export default class WebviewController {
  _connectionController: ConnectionController;
  _telemetryController: TelemetryController;

  constructor(
    connectionController: ConnectionController,
    telemetryController: TelemetryController
  ) {
    this._connectionController = connectionController;
    this._telemetryController = telemetryController;
  }

  listenForConnectionResultsAndUpdatePanel = (
    panel: vscode.WebviewPanel
  ): () => void => {
    const connectionDidChange = (): void => {
      if (
        !this._connectionController.isConnecting()
      ) {
        this._connectionController.removeEventListener(
          DataServiceEventTypes.CONNECTIONS_DID_CHANGE,
          connectionDidChange
        );

        panel.webview.postMessage({
          command: MESSAGE_TYPES.CONNECT_RESULT,
          connectionSuccess: this._connectionController.isCurrentlyConnected(),
          connectionMessage: this._connectionController.isCurrentlyConnected()
            ? `Successfully connected to ${this._connectionController.getActiveConnectionName()}.`
            : 'Unable to connect.'
        });
      }
    };

    this._connectionController.addEventListener(
      DataServiceEventTypes.CONNECTIONS_DID_CHANGE,
      connectionDidChange
    );

    // We return the listening function so we can remove the listener elsewhere.
    return connectionDidChange;
  };

  handleWebviewMessage = (
    message: MESSAGE_FROM_WEBVIEW_TO_EXTENSION,
    panel: vscode.WebviewPanel
  ): void => {
    switch (message.command) {
      case MESSAGE_TYPES.CONNECT:
        try {
          const connectionModel = this._connectionController
            .parseNewConnection(message.connectionModel);

          this.listenForConnectionResultsAndUpdatePanel(panel);

          this._connectionController.saveNewConnectionAndConnect(
            connectionModel,
            ConnectionTypes.CONNECTION_FORM
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Unable to load connection: ${error}`);

          panel.webview.postMessage({
            command: MESSAGE_TYPES.CONNECT_RESULT,
            connectionSuccess: false,
            connectionMessage: `Unable to load connection: ${error}`
          });
        }
        return;
      case MESSAGE_TYPES.CREATE_NEW_PLAYGROUND:
        vscode.commands.executeCommand(
          EXTENSION_COMMANDS.MDB_CREATE_PLAYGROUND_FROM_OVERVIEW_PAGE
        );
        return;
      case MESSAGE_TYPES.GET_CONNECTION_STATUS:
        panel.webview.postMessage({
          command: MESSAGE_TYPES.CONNECTION_STATUS_MESSAGE,
          connectionStatus: this._connectionController.getConnectionStatus(),
          activeConnectionName: this._connectionController.getActiveConnectionName()
        });
        return;
      case MESSAGE_TYPES.OPEN_FILE_PICKER:
        vscode.window
          .showOpenDialog({
            ...openFileOptions,
            canSelectMany: message.multi
          })
          .then((files) => {
            panel.webview.postMessage({
              command: MESSAGE_TYPES.FILE_PICKER_RESULTS,
              action: message.action,
              files:
                files && files.length > 0
                  ? files.map((file) => path.resolve(file.path.substr(1)))
                  : undefined
            });
          });
        return;
      case MESSAGE_TYPES.OPEN_CONNECTION_STRING_INPUT:
        vscode.commands.executeCommand(EXTENSION_COMMANDS.MDB_CONNECT_WITH_URI);

        return;
      case MESSAGE_TYPES.EXTENSION_LINK_CLICKED:
        this._telemetryController.trackLinkClicked(
          message.screen,
          message.linkId
        );

        return;

      case MESSAGE_TYPES.RENAME_ACTIVE_CONNECTION:
        if (this._connectionController.isCurrentlyConnected()) {
          this._connectionController.renameConnection(
            this._connectionController.getActiveConnectionId() as string
          );
        }

        return;
      default:
        // no-op.
        return;
    }
  };

  onRecievedWebviewMessage = (
    message: MESSAGE_FROM_WEBVIEW_TO_EXTENSION,
    panel: vscode.WebviewPanel
  ): void => {
    // Ensure handling message from the webview can't crash the extension.
    try {
      this.handleWebviewMessage(message, panel);
    } catch (err) {
      log.info('Error occured when parsing message from webview:');
      log.info(err);

      return;
    }
  };

  openWebview(
    view: WEBVIEW_VIEWS,
    viewTitle: string,
    context: vscode.ExtensionContext
  ): Promise<boolean> {
    const extensionPath = context.extensionPath;

    // Create and show a new connect dialogue webview.
    const panel = vscode.window.createWebviewPanel(
      'connectDialogueWebview',
      viewTitle,
      vscode.ViewColumn.One, // Editor column to show the webview panel in.
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(extensionPath, 'dist')),
          vscode.Uri.file(path.join(extensionPath, 'resources'))
        ]
      }
    );

    panel.iconPath = vscode.Uri.file(
      path.join(extensionPath, 'images', 'leaf.svg')
    );

    panel.webview.html = getWebviewContent(extensionPath, panel.webview, view);

    // Handle messages from the webview.
    panel.webview.onDidReceiveMessage(
      (message: MESSAGE_FROM_WEBVIEW_TO_EXTENSION) =>
        this.onRecievedWebviewMessage(message, panel),
      undefined,
      context.subscriptions
    );

    return Promise.resolve(true);
  }

  showConnectForm(context: vscode.ExtensionContext): Promise<boolean> {
    log.info('show connect form called.');

    return this.openWebview(WEBVIEW_VIEWS.CONNECT, 'Connect to MongoDB', context);
  }

  showOverviewPage(context: vscode.ExtensionContext): Promise<boolean> {
    log.info('show overview page called.');

    return this.openWebview(WEBVIEW_VIEWS.OVERVIEW, 'MongoDB', context);
  }
}

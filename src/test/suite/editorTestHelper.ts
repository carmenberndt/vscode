import * as vscode from 'vscode';
import * as path from 'path';

// Gets a test document from fixtures.
export const getDocUri = (docName: string): vscode.Uri => {
  const docPath = path.resolve(__dirname, '../../../src/test/fixture', docName);

  return vscode.Uri.file(docPath);
};

// Opens the MongoDB playground file, make a changes, and save to disc.
export async function loadAndSavePlayground(docUri: vscode.Uri): Promise<any> {
  try {
    return vscode.workspace.openTextDocument(docUri).then((doc) =>
      vscode.window.showTextDocument(doc, 1, false).then((editor) =>
        editor
          .edit((editBuilder) => {
            editBuilder.replace(new vscode.Range(0, 0, 1, 0), 'show dbs');
          })
          .then(() => doc.save())
      )
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

// Opens the MongoDB playground file.
export async function loadPlayground(docUri: vscode.Uri): Promise<any> {
  try {
    return vscode.workspace.openTextDocument(docUri).then((doc) => {
      return vscode.window.showTextDocument(doc, 1, false);
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

// Copying text, for the follow dialog's Copy button and the sites' own copy buttons.

/** Copies text to the clipboard: by the Clipboard API, else by selecting it in a text field and the
 *  copy command (plain-http origins other than localhost have no Clipboard API, and browsers may
 *  refuse it). Inside a modal dialog nothing outside it can be focused, so pass the dialog's field
 *  that shows the text; otherwise a hidden one is used. */
export async function writeClipboard(text: string, field?: HTMLInputElement): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return copyBySelection(text, field);
    }
}

function copyBySelection(text: string, field?: HTMLInputElement): boolean {
    const temp = field ? undefined : document.createElement('textarea');
    if (temp) {
        temp.value = text;
        temp.readOnly = true;
        temp.style.cssText = 'position: fixed; top: 0; left: 0; opacity: 0;';
        document.body.append(temp);
    }
    const el = field || temp!;
    el.focus();
    el.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        temp?.remove();
    }
}

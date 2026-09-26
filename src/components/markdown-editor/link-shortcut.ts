import { Extension, type Editor } from "@tiptap/core";

/**
 * Returns true if the user can add or edit a link at the current selection: some text
 * is selected, or the cursor is in a link.
 */
export function canEditLink(editor: Editor) {
    return !editor.state.selection.empty || editor.isActive("link");
}

/**
 * An editor extension that calls `onOpen` when the user presses Cmd+K (Ctrl+K on
 * Windows and Linux) and a link can be added or edited.
 */
export const LinkShortcut = Extension.create<{ onOpen: () => void }>({
    name: "linkShortcut",

    addOptions() {
        return { onOpen: () => {} };
    },

    addKeyboardShortcuts() {
        return {
            "Mod-k": ({ editor }) => {
                if (!canEditLink(editor)) return false;
                this.options.onOpen();
                return true;
            },
        };
    },
});

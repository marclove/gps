import { getMarkRange, posToDOMRect, type Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { LinkIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { toggleVariants } from "@/components/ui/toggle";
import { canEditLink } from "./link-shortcut";

/** Matches an address that starts with a scheme, such as `https:` or `mailto:`. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The Link button of the notes toolbar and its popover, where the user adds, changes,
 * or removes the link at the current selection. The parent controls whether the
 * popover is open, so that a keyboard shortcut can open it too.
 */
export function LinkPopover({
    editor,
    open,
    onOpenChange,
}: {
    editor: Editor;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const state = useEditorState({
        editor,
        selector: ({ editor }) => ({
            active: editor.isActive("link"),
            enabled: canEditLink(editor),
        }),
    });

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger
                aria-label="Link"
                aria-pressed={state.active}
                disabled={!state.enabled}
                className={toggleVariants({ size: "sm" })}
                // Keep the focus and the selection in the editor when the button is
                // clicked with the mouse.
                onMouseDown={(event) => event.preventDefault()}
            >
                <LinkIcon />
            </PopoverTrigger>
            <PopoverContent
                anchor={() => ({
                    getBoundingClientRect: () => linkTextRect(editor),
                })}
                align="start"
                finalFocus={false}
            >
                <LinkForm editor={editor} onDone={() => onOpenChange(false)} />
            </PopoverContent>
        </Popover>
    );
}

/**
 * Returns the position on screen of the text that the popover edits: the whole link
 * if the selection is in one, otherwise the selected text.
 */
function linkTextRect(editor: Editor) {
    const { state, view } = editor;
    const { from, to, $from } = state.selection;
    const link = getMarkRange($from, state.schema.marks.link);
    return link
        ? posToDOMRect(view, link.from, link.to)
        : posToDOMRect(view, from, to);
}

/**
 * The contents of the link popover. It is mounted each time the popover opens, so the
 * address field starts with the address of the current link.
 */
function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
    const current = editor.getAttributes("link").href as string | undefined;
    const [address, setAddress] = useState(current ?? "");
    const [invalid, setInvalid] = useState(false);

    function apply() {
        const trimmed = address.trim();
        const href = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
        // The link extension refuses unsafe addresses, such as `javascript:` ones.
        if (!editor.can().setLink({ href })) {
            setInvalid(true);
            return;
        }
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
        onDone();
    }

    function remove() {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        onDone();
    }

    return (
        <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                apply();
            }}
        >
            <Input
                // The popover moves the focus a moment after it opens, so without
                // `autoFocus` the first keys typed go to the notes and replace the
                // selected text.
                autoFocus
                aria-label="Link address"
                aria-invalid={invalid}
                placeholder="https://example.com"
                value={address}
                onChange={(event) => {
                    setAddress(event.target.value);
                    setInvalid(false);
                }}
            />
            <div className="flex justify-end gap-2">
                {current !== undefined && (
                    <Button type="button" variant="ghost" onClick={remove}>
                        Remove link
                    </Button>
                )}
                <Button type="submit" disabled={address.trim() === ""}>
                    Apply
                </Button>
            </div>
        </form>
    );
}

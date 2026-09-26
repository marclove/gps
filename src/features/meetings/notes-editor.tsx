import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Selection } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import {
    EditorContent,
    useEditor,
    useEditorState,
    type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
    BoldIcon,
    Heading1Icon,
    Heading2Icon,
    Heading3Icon,
    ItalicIcon,
    ListChecksIcon,
    ListIcon,
    ListOrderedIcon,
    type LucideIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import { Toggle } from "@/components/ui/toggle";
import { LinkPopover } from "./link-popover";
import { LinkShortcut } from "./link-shortcut";

/** A formatting button in the toolbar. */
type ToolbarItem = {
    label: string;
    icon: LucideIcon;
    isActive: (editor: Editor) => boolean;
    run: (editor: Editor) => void;
};

const TOOLBAR: ToolbarItem[] = [
    {
        label: "Bold",
        icon: BoldIcon,
        isActive: (editor) => editor.isActive("bold"),
        run: (editor) => editor.chain().focus().toggleBold().run(),
    },
    {
        label: "Italic",
        icon: ItalicIcon,
        isActive: (editor) => editor.isActive("italic"),
        run: (editor) => editor.chain().focus().toggleItalic().run(),
    },
    {
        label: "Heading 1",
        icon: Heading1Icon,
        isActive: (editor) => editor.isActive("heading", { level: 1 }),
        run: (editor) =>
            editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
        label: "Heading 2",
        icon: Heading2Icon,
        isActive: (editor) => editor.isActive("heading", { level: 2 }),
        run: (editor) =>
            editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
        label: "Heading 3",
        icon: Heading3Icon,
        isActive: (editor) => editor.isActive("heading", { level: 3 }),
        run: (editor) =>
            editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
        label: "Bullet list",
        icon: ListIcon,
        isActive: (editor) => editor.isActive("bulletList"),
        run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
        label: "Numbered list",
        icon: ListOrderedIcon,
        isActive: (editor) => editor.isActive("orderedList"),
        run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
        label: "Task list",
        icon: ListChecksIcon,
        isActive: (editor) => editor.isActive("taskList"),
        run: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
];

/**
 * A rich text editor for meeting notes. It reads and writes Markdown.
 *
 * The editor fills the height of its container. The toolbar stays at the top, and the
 * notes scroll below it. Give the editor a container with a fixed height, such as a grid
 * row of `minmax(0,1fr)`.
 *
 * `initialMarkdown` is read only when the editor is created. To show a different note,
 * give the component a different `key`. `onChange` receives the notes as Markdown after
 * each change.
 */
export function NotesEditor({
    initialMarkdown,
    onChange,
}: {
    initialMarkdown: string;
    onChange: (markdown: string) => void;
}) {
    const [linkOpen, setLinkOpen] = useState(false);
    const editor = useEditor({
        extensions: [
            // TipTap must not open a link when it is clicked. The opener plugin
            // opens it in the system browser instead, because the link extension
            // draws every link with `target="_blank"`.
            StarterKit.configure({ link: { openOnClick: false } }),
            LinkShortcut.configure({ onOpen: () => setLinkOpen(true) }),
            // Keeps the selected text marked while the focus is elsewhere, such as
            // in the link popover.
            Selection,
            TaskList,
            TaskItem.configure({ nested: true }),
            Markdown,
        ],
        content: initialMarkdown,
        contentType: "markdown",
        editorProps: {
            attributes: {
                role: "textbox",
                "aria-label": "Notes",
                "aria-multiline": "true",
                class: "notes-editor prose prose-sm dark:prose-invert max-w-none flex-1 pb-4 focus:outline-none",
            },
        },
        onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
    });

    const active = useEditorState({
        editor,
        selector: ({ editor }) =>
            TOOLBAR.map((item) => (editor ? item.isActive(editor) : false)),
    });

    return (
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <div
                role="toolbar"
                aria-label="Formatting"
                className="mx-6 flex flex-wrap gap-1 border-b pb-2"
            >
                {TOOLBAR.map((item, index) => (
                    <Fragment key={item.label}>
                        <Toggle
                            size="sm"
                            aria-label={item.label}
                            pressed={active?.[index] ?? false}
                            // Keep the focus and the selection in the editor when the
                            // button is clicked with the mouse.
                            onMouseDown={(event) => event.preventDefault()}
                            onPressedChange={() => editor && item.run(editor)}
                        >
                            <item.icon />
                        </Toggle>
                        {item.label === "Italic" && editor && (
                            <LinkPopover
                                editor={editor}
                                open={linkOpen}
                                onOpenChange={(open) => {
                                    setLinkOpen(open);
                                    if (!open) editor.commands.focus();
                                }}
                            />
                        )}
                    </Fragment>
                ))}
            </div>
            {/* The notes area spans the full width, so its scroll bar is at the edge
                of the window. The editor stretches to fill it, so that a click below
                short notes puts the text cursor in the notes. Without `min-w-0`, a
                long word without spaces makes the editor wider than the window. */}
            <div className="flex overflow-y-auto px-6 pt-6">
                <EditorContent
                    editor={editor}
                    className="flex min-w-0 flex-1 flex-col"
                />
            </div>
        </div>
    );
}

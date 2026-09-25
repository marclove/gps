import { TaskItem, TaskList } from "@tiptap/extension-list";
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
    Heading2Icon,
    ItalicIcon,
    ListChecksIcon,
    ListIcon,
    ListOrderedIcon,
    type LucideIcon,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

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
        label: "Heading",
        icon: Heading2Icon,
        isActive: (editor) => editor.isActive("heading", { level: 2 }),
        run: (editor) =>
            editor.chain().focus().toggleHeading({ level: 2 }).run(),
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
    const editor = useEditor({
        extensions: [
            // A click on a link inside the app window must not open a web view
            // window. Opening links in the system browser instead needs the
            // opener plugin, which this feature does not add.
            StarterKit.configure({ link: { openOnClick: false } }),
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
                class: "notes-editor prose prose-sm dark:prose-invert max-w-none min-h-64 focus:outline-none",
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
        <div className="flex flex-col gap-4">
            <div
                role="toolbar"
                aria-label="Formatting"
                className="flex flex-wrap gap-1 border-b pb-2"
            >
                {TOOLBAR.map((item, index) => (
                    <Toggle
                        key={item.label}
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
                ))}
            </div>
            <EditorContent editor={editor} />
        </div>
    );
}

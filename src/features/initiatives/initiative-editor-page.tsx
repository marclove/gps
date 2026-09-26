import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getInitiative, type Initiative } from "@/lib/initiatives";
import { InitiativeEditor } from "./initiative-editor";
import type { NewInitiativeState } from "./initiatives-page";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "not-found" }
    | { kind: "loaded"; initiative: Initiative };

/** The page that loads one initiative, by the identifier in the route, and shows its editor. */
export function InitiativeEditorPage() {
    const { id } = useParams();
    const location = useLocation();
    const isNew = (location.state as NewInitiativeState | null)?.isNew === true;

    // The key gives each initiative a new loader and editor, so that the editor of one
    // initiative saves its changes before the editor of the next initiative opens.
    return <InitiativeLoader key={id} id={Number(id)} isNew={isNew} />;
}

function InitiativeLoader({ id, isNew }: { id: number; isNew: boolean }) {
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;
        getInitiative(id).then(
            (initiative) => {
                if (!current) return;
                setLoad(
                    initiative
                        ? { kind: "loaded", initiative }
                        : { kind: "not-found" },
                );
            },
            () => current && setLoad({ kind: "error" }),
        );
        return () => {
            current = false;
        };
    }, [id, attempt]);

    if (load.kind === "loaded") {
        return <InitiativeEditor initiative={load.initiative} isNew={isNew} />;
    }

    return (
        <>
            <PageHeader
                crumbs={[{ label: "Initiatives", to: "/initiatives" }]}
            />
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0 text-sm">
                {load.kind === "loading" && (
                    <p className="text-muted-foreground">Loading…</p>
                )}
                {load.kind === "not-found" && (
                    <p>
                        This initiative doesn't exist.{" "}
                        <Link to="/initiatives" className="underline">
                            Back to Initiatives
                        </Link>
                    </p>
                )}
                {load.kind === "error" && (
                    <div className="flex items-center gap-2">
                        <p>Couldn't load this initiative</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setLoad({ kind: "loading" });
                                setAttempt((value) => value + 1);
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
}

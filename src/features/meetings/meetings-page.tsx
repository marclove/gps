import { PageHeader } from "@/components/page-header";

/** The page that lists all meetings. */
export function MeetingsPage() {
    return <PageHeader crumbs={[{ label: "Meetings" }]} />;
}

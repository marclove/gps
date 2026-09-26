import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailsSidebar } from "./details-sidebar";

describe("DetailsSidebar", () => {
    it("leaves out the separator and the lists when there are none", () => {
        render(
            <DetailsSidebar
                label="Initiative details"
                properties={<div>Role</div>}
                actions={<button>Archive</button>}
            />,
        );

        const sidebar = screen.getByRole("complementary", {
            name: "Initiative details",
        });
        expect(
            within(sidebar).queryByRole("separator"),
        ).not.toBeInTheDocument();
    });
});

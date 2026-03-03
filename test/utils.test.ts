import { describe, it, expect } from "vitest";
import { getReviewState, getReviewsByAuthor, getLastStateByAuthor } from "../src/utils";
import type { ReviewEdge } from "../src/types";

describe("Utils Tests", () => {
    const TEST_REVIEWS: ReviewEdge[] = [
        {
            node: {
                author: { login: "alice" },
                state: "COMMENTED",
            },
        },
        {
            node: {
                author: { login: "jane" },
                state: "COMMENTED",
            },
        },
        {
            node: {
                author: { login: "john" },
                state: "APPROVED",
            },
        },
        {
            node: {
                author: { login: "jane" },
                state: "APPROVED",
            },
        },
        {
            node: {
                author: { login: "marc" },
                state: "CHANGES_REQUESTED",
            },
        },
    ];

    it("getReviewsByAuthor groups reviews by author", () => {
        const expected = {
            alice: [
                {
                    author: { login: "alice" },
                    state: "COMMENTED",
                },
            ],
            john: [{ author: { login: "john" }, state: "APPROVED" }],
            jane: [
                {
                    author: { login: "jane" },
                    state: "COMMENTED",
                },
                { author: { login: "jane" }, state: "APPROVED" },
            ],
            marc: [
                {
                    author: { login: "marc" },
                    state: "CHANGES_REQUESTED",
                },
            ],
        };
        const actual = getReviewsByAuthor(TEST_REVIEWS);
        expect(actual).toEqual(expected);
    });

    it("getLastStateByAuthor returns last state per author", () => {
        const expected = ["APPROVED", "APPROVED", "CHANGES_REQUESTED"];
        const reviewsByAuthor = getReviewsByAuthor(TEST_REVIEWS);
        const actual = getLastStateByAuthor(reviewsByAuthor);
        expect(actual).toEqual(expected);
    });

    it("getReviewState - without reviews and no review policy", () => {
        const reviews: ReviewEdge[] = [];
        // When reviewDecision is null (no policy), reviews are passing
        const expected = {
            hasComments: false,
            isApproved: undefined,
            hasPendingChangeRequests: undefined,
            reviewsPassing: true,
        };
        const actual = getReviewState({ edges: reviews }, null);
        expect(actual).toEqual(expected);
    });

    it("getReviewState - with changes requested", () => {
        const expected = {
            hasComments: true,
            isApproved: false,
            hasPendingChangeRequests: true,
            reviewsPassing: false,
        };
        const actual = getReviewState({ edges: TEST_REVIEWS }, "CHANGES_REQUESTED");
        expect(actual).toEqual(expected);
    });

    it("getReviewState - approved", () => {
        const reviews: ReviewEdge[] = [
            {
                node: {
                    author: { login: "alice" },
                    state: "COMMENTED",
                },
            },
            {
                node: {
                    author: { login: "jane" },
                    state: "COMMENTED",
                },
            },
            {
                node: {
                    author: { login: "john" },
                    state: "APPROVED",
                },
            },
            {
                node: {
                    author: { login: "jane" },
                    state: "APPROVED",
                },
            },
            {
                node: {
                    author: { login: "marc" },
                    state: "CHANGES_REQUESTED",
                },
            },
            {
                node: {
                    author: { login: "marc" },
                    state: "APPROVED",
                },
            },
        ];
        const expected = {
            hasComments: true,
            isApproved: true,
            hasPendingChangeRequests: false,
            reviewsPassing: true,
        };
        const actual = getReviewState({ edges: reviews }, "APPROVED");
        expect(actual).toEqual(expected);
    });

    it("getReviewState - without comments", () => {
        const reviews: ReviewEdge[] = [
            {
                node: {
                    author: { login: "john" },
                    state: "APPROVED",
                },
            },
            {
                node: {
                    author: { login: "jane" },
                    state: "APPROVED",
                },
            },
            {
                node: {
                    author: { login: "marc" },
                    state: "CHANGES_REQUESTED",
                },
            },
            {
                node: {
                    author: { login: "marc" },
                    state: "APPROVED",
                },
            },
        ];
        const expected = {
            hasComments: false,
            isApproved: true,
            hasPendingChangeRequests: false,
            reviewsPassing: true,
        };
        const actual = getReviewState({ edges: reviews }, "APPROVED");
        expect(actual).toEqual(expected);
    });

    it("getReviewState - with comments only and review required", () => {
        const reviews: ReviewEdge[] = [
            {
                node: {
                    author: { login: "john" },
                    state: "COMMENTED",
                },
            },
            {
                node: {
                    author: { login: "jane" },
                    state: "COMMENTED",
                },
            },
            {
                node: {
                    author: { login: "marc" },
                    state: "COMMENTED",
                },
            },
            {
                node: {
                    author: { login: "marc" },
                    state: "COMMENTED",
                },
            },
        ];
        // Comments only with REVIEW_REQUIRED means reviews are NOT passing
        const expected = {
            hasComments: true,
            isApproved: false,
            hasPendingChangeRequests: false,
            reviewsPassing: false,
        };
        const actual = getReviewState({ edges: reviews }, "REVIEW_REQUIRED");
        expect(actual).toEqual(expected);
    });
});

import { describe, expect, it } from "vitest";
import type { CursorTelemetryPoint } from "../types";
import {
	buildInteractionZoomSuggestions,
	CLICK_CLUSTER_MERGE_GAP_MS,
	CLICK_ZOOM_PAD_MS,
	shouldAutoApplyFreshRecordingZoomsForSource,
} from "./zoomSuggestionUtils";

function makeClick(
	timeMs: number,
	cx = 0.5,
	cy = 0.5,
	interactionType: CursorTelemetryPoint["interactionType"] = "click",
): CursorTelemetryPoint {
	return { timeMs, cx, cy, interactionType };
}

function makeMove(timeMs: number, cx = 0.5, cy = 0.5): CursorTelemetryPoint {
	return { timeMs, cx, cy, interactionType: "move" };
}

/** Wraps click samples with surrounding move events to mimic real mixed telemetry. */
function withMoves(clicks: CursorTelemetryPoint[], totalMs: number): CursorTelemetryPoint[] {
	return [makeMove(0), ...clicks, makeMove(totalMs)];
}

const TOTAL_MS = 30_000;

describe("shouldAutoApplyFreshRecordingZoomsForSource", () => {
	it("allows automatic fresh-recording zooms for landscape captures", () => {
		expect(shouldAutoApplyFreshRecordingZoomsForSource(1920, 1080)).toBe(true);
		expect(shouldAutoApplyFreshRecordingZoomsForSource(1280, 960)).toBe(true);
	});

	it("blocks automatic fresh-recording zooms for narrow or near-square captures", () => {
		expect(shouldAutoApplyFreshRecordingZoomsForSource(960, 1020)).toBe(false);
		expect(shouldAutoApplyFreshRecordingZoomsForSource(1080, 1080)).toBe(false);
	});

	it("allows narrow Windows window captures when click telemetry is available", () => {
		expect(shouldAutoApplyFreshRecordingZoomsForSource(936, 1028, "win32")).toBe(true);
	});

	it("does not block when source dimensions are not available yet", () => {
		expect(shouldAutoApplyFreshRecordingZoomsForSource()).toBe(true);
	});
});

describe("buildInteractionZoomSuggestions (click-cluster logic)", () => {
	it("creates one zoom track for a single isolated click with 500ms padding", () => {
		const telemetry = withMoves([makeClick(5_000)], TOTAL_MS);

		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: telemetry,
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toHaveLength(1);

		const [s] = result.suggestions;
		expect(s.start).toBe(5_000 - CLICK_ZOOM_PAD_MS);
		expect(s.end).toBe(5_000 + CLICK_ZOOM_PAD_MS);
	});

	it("accepts a single explicit click sample without needing surrounding moves", () => {
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: [makeClick(5_000)],
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toHaveLength(1);
	});

	it.each([
		"right-click",
		"middle-click",
	] as const)("accepts %s telemetry like a standard click", (interactionType) => {
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: withMoves([makeClick(5_000, 0.5, 0.5, interactionType)], TOTAL_MS),
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toHaveLength(1);

		const [suggestion] = result.suggestions;
		expect(suggestion.start).toBe(5_000 - CLICK_ZOOM_PAD_MS);
		expect(suggestion.end).toBe(5_000 + CLICK_ZOOM_PAD_MS);
	});

	it("keeps clicks within the merge gap in one timeline zoom region", () => {
		const firstClick = 4_000;
		const secondClick = 5_500;
		const telemetry = withMoves(
			[makeClick(firstClick, 0.25, 0.3), makeClick(secondClick, 0.75, 0.7)],
			TOTAL_MS,
		);

		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: telemetry,
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toHaveLength(1);
		expect(result.suggestions[0]).toEqual({
			start: firstClick - CLICK_ZOOM_PAD_MS,
			end: secondClick + CLICK_ZOOM_PAD_MS,
			focus: { cx: 0.25, cy: 0.3 },
		});
	});

	it("keeps closely spaced clicks in one timeline zoom region", () => {
		const firstClick = 4_000;
		const secondClick = 4_400;
		const telemetry = withMoves([makeClick(firstClick), makeClick(secondClick)], TOTAL_MS);

		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: telemetry,
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toHaveLength(1);
		expect(result.suggestions[0].start).toBe(firstClick - CLICK_ZOOM_PAD_MS);
		expect(result.suggestions[0].end).toBe(secondClick + CLICK_ZOOM_PAD_MS);
	});

	it("keeps a rapid click sequence in one timeline zoom region", () => {
		const telemetry = withMoves([makeClick(0), makeClick(2_000), makeClick(4_000)], TOTAL_MS);

		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: telemetry,
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toHaveLength(1);
		expect(result.suggestions[0].start).toBe(0);
		expect(result.suggestions[0].end).toBe(4_000 + CLICK_ZOOM_PAD_MS);
	});

	it("splits clicks more than the merge gap into separate regions", () => {
		const firstClick = 3_000;
		const secondClick = firstClick + CLICK_CLUSTER_MERGE_GAP_MS + 1;
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: withMoves(
				[makeClick(firstClick), makeClick(secondClick)],
				TOTAL_MS,
			),
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.suggestions).toHaveLength(2);
		expect(result.suggestions.map(({ start, end }) => [start, end])).toEqual([
			[firstClick - CLICK_ZOOM_PAD_MS, firstClick + CLICK_ZOOM_PAD_MS],
			[secondClick - CLICK_ZOOM_PAD_MS, secondClick + CLICK_ZOOM_PAD_MS],
		]);
	});

	it("returns no-interactions when there are no click telemetry points", () => {
		// Move events only — no clicks
		const telemetry: CursorTelemetryPoint[] = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" },
			{ timeMs: 1_000, cx: 0.5, cy: 0.5, interactionType: "move" },
			{ timeMs: 2_000, cx: 0.6, cy: 0.6, interactionType: "move" },
			{ timeMs: TOTAL_MS, cx: 0.6, cy: 0.6, interactionType: "move" },
		];

		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: telemetry,
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("no-interactions");
		expect(result.suggestions).toHaveLength(0);
	});

	it("ignores dwell-derived click-like heuristics when there are no explicit clicks", () => {
		const telemetry: CursorTelemetryPoint[] = [
			makeMove(0, 0.5, 0.5),
			makeMove(200, 0.5005, 0.5005),
			makeMove(400, 0.5008, 0.5008),
			makeMove(600, 0.501, 0.501),
		];

		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: telemetry,
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("no-interactions");
		expect(result.suggestions).toHaveLength(0);
	});

	it("skips clicks that overlap reserved spans", () => {
		const click = 5_000;

		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: withMoves([makeClick(click)], TOTAL_MS),
			totalMs: TOTAL_MS,
			defaultDurationMs: 3_000,
			reservedSpans: [{ start: 4_000, end: 6_000 }], // overlaps the cluster window
		});

		expect(result.status).toBe("no-slots");
		expect(result.suggestions).toHaveLength(0);
	});

	it("clamps start to 0 and end to totalMs at video boundaries", () => {
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: withMoves([makeClick(200)], 1_000),
			totalMs: 1_000,
			defaultDurationMs: 3_000,
		});

		expect(result.status).toBe("ok");
		const [s] = result.suggestions;
		expect(s.start).toBeGreaterThanOrEqual(0);
		expect(s.end).toBeLessThanOrEqual(1_000);
	});
});

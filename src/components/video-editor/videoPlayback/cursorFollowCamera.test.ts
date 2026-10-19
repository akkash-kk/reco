import { describe, expect, it } from "vitest";
import { computeCursorFollowFocus, createCursorFollowCameraState } from "./cursorFollowCamera";

describe("computeCursorFollowFocus", () => {
	it("follows the cursor continuously inside the former safe zone", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.6, cy: 0.58, interactionType: "move" as const },
		];

		const initialFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
			{ snapToEdgesRatio: 0.25 },
		);
		const currentFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);

		expect(initialFocus).toEqual({ cx: 0.5, cy: 0.5 });
		expect(currentFocus).toEqual({ cx: 0.6, cy: 0.58 });
	});

	it("tracks each moving cursor sample", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.7, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 200, cx: 0.72, cy: 0.5, interactionType: "move" as const },
		];

		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);

		const firstShift = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);
		const secondShift = computeCursorFollowFocus(
			state,
			cursorSamples,
			200,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);

		expect(firstShift.cx).toBeCloseTo(0.7, 6);
		expect(firstShift.cy).toBeCloseTo(0.5, 6);
		expect(secondShift.cx).toBeCloseTo(0.72, 6);
		expect(secondShift.cy).toBeCloseTo(0.5, 6);
	});

	it("clamps the camera when the cursor pushes past the stage edge", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 1, cy: 1, interactionType: "move" as const },
		];

		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);

		const clampedFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);

		expect(clampedFocus).toEqual({ cx: 0.75, cy: 0.75 });
	});

	it("follows the cursor from the first frame of auto zoom", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.8, cy: 0.2, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.82, cy: 0.22, interactionType: "move" as const },
		];

		const initialFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.3, cy: 0.7 },
			{ snapToEdgesRatio: 0.25 },
		);

		expect(initialFocus).toEqual({ cx: 0.75, cy: 0.25 });
	});

	it("follows cursor rather than switching focus with a new auto-zoom region", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.5, cy: 0.5, interactionType: "move" as const },
		];

		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);
		const nextRegionFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.7, cy: 0.3 },
		);

		expect(nextRegionFocus).toEqual({ cx: 0.5, cy: 0.5 });
	});

	it("uses the cursor position when an auto-zoom region still has the default center focus", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.8, cy: 0.2, interactionType: "move" as const },
			{ timeMs: 100, cx: 0.8, cy: 0.2, interactionType: "move" as const },
		];

		const focus = computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);

		expect(focus).toEqual({ cx: 0.75, cy: 0.25 });
	});

	it("recenters to each click even when the next click is inside the safe zone", () => {
		const state = createCursorFollowCameraState();
		const cursorSamples = [
			{ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: "click" as const },
			{ timeMs: 100, cx: 0.6, cy: 0.5, interactionType: "click" as const },
		];

		computeCursorFollowFocus(
			state,
			cursorSamples,
			0,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);
		const nextClickFocus = computeCursorFollowFocus(
			state,
			cursorSamples,
			100,
			2,
			1,
			{ cx: 0.5, cy: 0.5 },
		);

		expect(nextClickFocus).toEqual({ cx: 0.6, cy: 0.5 });
	});
});

import type { CursorTelemetryPoint, ZoomFocus } from "../types";
import { interpolateCursorPosition } from "./cursorRenderer";
import { clampFocusToScale } from "./focusUtils";

/**
 * Cursor-follow camera.
 *
 * Keeps the current pointer position at the center of automatic zoom regions.
 * The preview/export camera applies its own spring to smooth this target.
 */

export interface CursorFollowCameraState {
	/** Whether the state has been initialized with a starting position */
	initialized: boolean;
	/** Time of last update in ms (video time, not wall clock) */
	lastTimeMs: number;
	/** Current camera focus while zoomed */
	focusX: number;
	/** Current camera focus while zoomed */
	focusY: number;
	/** Whether the camera was active (zoomed) on the previous frame */
	wasZoomed: boolean;
}

export function createCursorFollowCameraState(): CursorFollowCameraState {
	return {
		initialized: false,
		lastTimeMs: 0,
		focusX: 0.5,
		focusY: 0.5,
		wasZoomed: false,
	};
}

export function resetCursorFollowCamera(state: CursorFollowCameraState): void {
	state.initialized = false;
	state.lastTimeMs = 0;
	state.focusX = 0.5;
	state.focusY = 0.5;
	state.wasZoomed = false;
}

/**
 * Cursor follow: target focus computation.
 *
 * Returns the current cursor position as the camera target. The zoom
 * transition layer handles smooth interpolation toward that target.
 *
 * @returns The target focus point for this frame (normalized 0-1).
 */
export function computeCursorFollowFocus(
	state: CursorFollowCameraState,
	cursorSamples: CursorTelemetryPoint[],
	timeMs: number,
	zoomScale: number,
	zoomStrength: number,
	regionFocus: ZoomFocus,
): ZoomFocus {
	const clampedRegionFocus = clampFocusToScale(regionFocus, zoomScale);

	// If not zoomed (strength ≈ 0), reset state and return region focus
	if (zoomStrength < 0.01) {
		if (state.wasZoomed) {
			state.wasZoomed = false;
			state.initialized = false;
		}
		return clampedRegionFocus;
	}

	const cursorPos = interpolateCursorPosition(cursorSamples, timeMs);
	const timeWentBackwards = state.initialized && timeMs + 0.5 < state.lastTimeMs;
	if (!cursorPos) {
		return state.initialized ? { cx: state.focusX, cy: state.focusY } : clampedRegionFocus;
	}

	const targetFocus = clampFocusToScale(cursorPos, zoomScale);
	state.lastTimeMs = timeMs;
	state.initialized = true;
	state.wasZoomed = true;
	state.focusX = targetFocus.cx;
	state.focusY = targetFocus.cy;
	if (timeWentBackwards) state.lastTimeMs = timeMs;
	return targetFocus;
}

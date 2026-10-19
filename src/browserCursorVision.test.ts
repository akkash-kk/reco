import { describe, expect, it } from "vitest";
import { detectCursorMotion, type CursorVisionFrame } from "./browserCursorVision";

function makeFrame(cursorX?: number, cursorY?: number): CursorVisionFrame {
	const width = 100;
	const height = 80;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
	if (cursorX !== undefined && cursorY !== undefined) {
		for (let row = 0; row < 10; row += 1) {
			for (let column = 0; column < 7 - Math.floor(row / 2); column += 1) {
				const offset = ((cursorY + row) * width + cursorX + column) * 4;
				data[offset] = 255;
				data[offset + 1] = 255;
				data[offset + 2] = 255;
			}
		}
	}
	return { width, height, data };
}

describe("detectCursorMotion", () => {
	it("finds the new pointer position from changed cursor pixels", () => {
		const result = detectCursorMotion(
			makeFrame(15, 20),
			makeFrame(55, 40),
		);

		expect(result?.cx).toBeCloseTo(0.55, 2);
		expect(result?.cy).toBeCloseTo(0.5, 2);
	});

	it("does not invent a cursor position when the frame has no motion", () => {
		expect(detectCursorMotion(makeFrame(20, 20), makeFrame(20, 20))).toBeNull();
	});
});
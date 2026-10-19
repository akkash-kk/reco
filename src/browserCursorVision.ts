export type CursorVisionFrame = {
	width: number;
	height: number;
	data: Uint8ClampedArray;
};

export type DetectedCursorPosition = {
	cx: number;
	cy: number;
};

type ChangedRegion = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	count: number;
	cursorScore: number;
};

const PIXEL_CHANGE_THRESHOLD = 72;
const MIN_CURSOR_CHANGE_PIXELS = 5;
const MAX_CURSOR_CHANGE_PIXELS = 600;

export function detectCursorMotion(
	previous: CursorVisionFrame,
	current: CursorVisionFrame,
	previousPosition?: DetectedCursorPosition | null,
): DetectedCursorPosition | null {
	if (
		previous.width !== current.width ||
		previous.height !== current.height ||
		previous.data.length !== current.data.length
	) {
		return null;
	}

	const { width, height } = current;
	const changed = new Uint8Array(width * height);
	for (let pixel = 0, offset = 0; pixel < changed.length; pixel += 1, offset += 4) {
		const difference = Math.max(
			Math.abs(previous.data[offset] - current.data[offset]),
			Math.abs(previous.data[offset + 1] - current.data[offset + 1]),
			Math.abs(previous.data[offset + 2] - current.data[offset + 2]),
		);
		if (difference >= PIXEL_CHANGE_THRESHOLD) changed[pixel] = 1;
	}

	const visited = new Uint8Array(changed.length);
	const pending = new Int32Array(changed.length);
	const candidates: ChangedRegion[] = [];
	for (let start = 0; start < changed.length; start += 1) {
		if (!changed[start] || visited[start]) continue;

		let readIndex = 0;
		let writeIndex = 0;
		pending[writeIndex++] = start;
		visited[start] = 1;
		let left = width;
		let top = height;
		let right = 0;
		let bottom = 0;

		while (readIndex < writeIndex) {
			const pixel = pending[readIndex++];
			const x = pixel % width;
			const y = Math.floor(pixel / width);
			left = Math.min(left, x);
			top = Math.min(top, y);
			right = Math.max(right, x);
			bottom = Math.max(bottom, y);

			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue;
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
					const neighbor = ny * width + nx;
					if (!changed[neighbor] || visited[neighbor]) continue;
					visited[neighbor] = 1;
					pending[writeIndex++] = neighbor;
				}
			}
		}

		const regionWidth = right - left + 1;
		const regionHeight = bottom - top + 1;
		if (
			writeIndex < MIN_CURSOR_CHANGE_PIXELS ||
			writeIndex > MAX_CURSOR_CHANGE_PIXELS ||
			regionWidth < 2 ||
			regionHeight < 3 ||
			regionWidth > width * 0.08 ||
			regionHeight > height * 0.16
		) {
			continue;
		}

		let brightPixels = 0;
		let darkPixels = 0;
		let highContrastEdges = 0;
		for (let y = top; y <= bottom; y += 1) {
			for (let x = left; x <= right; x += 1) {
				const offset = (y * width + x) * 4;
				const intensity =
					(current.data[offset] + current.data[offset + 1] + current.data[offset + 2]) / 3;
				if (intensity >= 210) brightPixels += 1;
				if (intensity <= 55) darkPixels += 1;
				if (x < right) {
					const adjacentOffset = offset + 4;
					const adjacentIntensity =
						(current.data[adjacentOffset] +
							current.data[adjacentOffset + 1] +
							current.data[adjacentOffset + 2]) /
						3;
					if (Math.abs(intensity - adjacentIntensity) > 120) highContrastEdges += 1;
				}
			}
		}
		const regionArea = regionWidth * regionHeight;
		const cursorScore =
			(Math.min(brightPixels, darkPixels) / regionArea) * 4 +
			highContrastEdges / regionArea;
		candidates.push({ left, top, right, bottom, count: writeIndex, cursorScore });
	}

	if (candidates.length === 0) return null;
	const previousX = (previousPosition?.cx ?? 0.5) * width;
	const previousY = (previousPosition?.cy ?? 0.5) * height;
	candidates.sort((a, b) => {
		const aDistance = Math.hypot(a.left - previousX, a.top - previousY);
		const bDistance = Math.hypot(b.left - previousX, b.top - previousY);
		const aAspect = (a.right - a.left + 1) / (a.bottom - a.top + 1);
		const bAspect = (b.right - b.left + 1) / (b.bottom - b.top + 1);
		const aShapeScore = 1 - Math.min(1, Math.abs(aAspect - 0.55));
		const bShapeScore = 1 - Math.min(1, Math.abs(bAspect - 0.55));
		const aScore =
			aShapeScore +
			a.cursorScore * 2 +
			(previousPosition ? Math.min(0.5, aDistance / width) : 0);
		const bScore =
			bShapeScore +
			b.cursorScore * 2 +
			(previousPosition ? Math.min(0.5, bDistance / width) : 0);
		return bScore - aScore;
	});

	const candidate = candidates[0];
	return { cx: candidate.left / width, cy: candidate.top / height };
}
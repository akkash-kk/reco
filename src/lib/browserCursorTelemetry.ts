import type { CursorTelemetryPoint } from "@/components/video-editor/types";

const telemetryBySource = new Map<string, CursorTelemetryPoint[]>();
const mimeTypeBySource = new Map<string, string>();

export function setBrowserCursorTelemetry(
	sourcePath: string,
	samples: CursorTelemetryPoint[],
	mimeType?: string,
) {
	telemetryBySource.set(sourcePath, samples);
	if (mimeType) mimeTypeBySource.set(sourcePath, mimeType);
}

export function getBrowserCursorTelemetry(sourcePath: string): CursorTelemetryPoint[] | null {
	return telemetryBySource.get(sourcePath) ?? null;
}

export function getBrowserRecordingMimeType(sourcePath: string): string | null {
	return mimeTypeBySource.get(sourcePath) ?? null;
}
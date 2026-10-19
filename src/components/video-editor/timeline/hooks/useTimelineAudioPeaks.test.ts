import { describe, expect, it } from "vitest";
import { buildSidecarAudioCandidates } from "./sidecarAudioCandidates";

describe("buildSidecarAudioCandidates", () => {
	it.each([
		"blob:http://127.0.0.1:4175/recording-id",
		"data:video/webm;base64,AAAA",
		"https://example.com/recording.webm",
	])("does not derive filesystem sidecars from %s", (source) => {
		expect(buildSidecarAudioCandidates(source)).toEqual([]);
	});

	it("derives companion audio paths from a local recording path", () => {
		expect(buildSidecarAudioCandidates("C:\\Recordings\\capture.mp4")).toEqual([
			"C:/Recordings/capture.system.wav",
			"C:/Recordings/capture.mic.wav",
			"C:/Recordings/capture.system.m4a",
			"C:/Recordings/capture.mic.m4a",
			"C:/Recordings/capture.system.webm",
			"C:/Recordings/capture.mic.webm",
		]);
	});
});
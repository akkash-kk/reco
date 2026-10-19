import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { fixParsedWebmDuration, fixWebmDuration } from "@fix-webm-duration/fix";
import { WebmFile } from "@fix-webm-duration/parser";
import {
	isWebmMimeType,
	selectBrowserScreenRecordingMimeType,
} from "@/hooks/recordingMimeType";
import { detectCursorMotion, type CursorVisionFrame } from "./browserCursorVision";

type CaptureStatus = "recording" | "paused" | "saving";

type CaptureStateDetail = {
	status: CaptureStatus;
	elapsed: number;
};

let recorder: MediaRecorder | null = null;
let displayStream: MediaStream | null = null;
let microphoneStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let chunks: Blob[] = [];
let segmentStartedAt = 0;
let elapsedBeforePause = 0;
let ticker: number | null = null;
let cursorTelemetry: CursorTelemetryPoint[] = [];
let lastPointerSampleMs = -Infinity;
let hideOverlayCursorByDefault = false;
let visionVideo: HTMLVideoElement | null = null;
let visionCanvas: HTMLCanvasElement | null = null;
let visionContext: CanvasRenderingContext2D | null = null;
let visionTimer: number | null = null;
let previousVisionFrame: CursorVisionFrame | null = null;
let lastVisionPosition: { cx: number; cy: number } | null = null;
let lastVisionMovementMs = -Infinity;
let visionClickRecorded = false;
const VISION_FRAME_WIDTH = 320;
const VISION_SAMPLE_INTERVAL_MS = 250;

async function repairWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
	try {
		const file = await WebmFile.fromBlob(blob);
		const durationSection = file
			.getSectionById(0x8538067)
			?.getSectionById(0x549a966)
			?.getSectionById(0x489);
		if (durationSection?.getValue()) durationSection.setValue(0);
		if (fixParsedWebmDuration(file, durationMs, { logger: false })) {
			return file.toBlob(blob.type);
		}
	} catch (error) {
		console.warn("Could not rewrite browser recording duration metadata:", error);
	}

	return fixWebmDuration(blob, durationMs, { logger: false });
}

function elapsedNow() {
	return elapsedBeforePause + (recorder?.state === "recording" ? Date.now() - segmentStartedAt : 0);
}

function emitState(status: CaptureStatus) {
	window.dispatchEvent(
		new CustomEvent<CaptureStateDetail>("recordly:web-capture-state", {
			detail: { status, elapsed: elapsedNow() },
		}),
	);
}

function clearCapture() {
	if (ticker !== null) window.clearInterval(ticker);
	ticker = null;
	if (visionTimer !== null) window.clearInterval(visionTimer);
	visionTimer = null;
	if (visionVideo) {
		visionVideo.pause();
		visionVideo.srcObject = null;
		visionVideo.remove();
	}
	visionVideo = null;
	visionCanvas = null;
	visionContext = null;
	previousVisionFrame = null;
	lastVisionPosition = null;
	lastVisionMovementMs = -Infinity;
	visionClickRecorded = false;
	displayStream?.getTracks().forEach((track) => track.stop());
	microphoneStream?.getTracks().forEach((track) => track.stop());
	displayStream = null;
	microphoneStream = null;
	void audioContext?.close().catch(() => undefined);
	audioContext = null;
	recorder = null;
	chunks = [];
	segmentStartedAt = 0;
	elapsedBeforePause = 0;
	cursorTelemetry = [];
	lastPointerSampleMs = -Infinity;
	hideOverlayCursorByDefault = false;
}

async function startVisualCursorTracking(stream: MediaStream) {
	const track = stream.getVideoTracks()[0];
	const settings = track?.getSettings();
	if (!track || !settings?.width || !settings.height) return;

	const frameHeight = Math.max(1, Math.round(VISION_FRAME_WIDTH * settings.height / settings.width));
	visionVideo = document.createElement("video");
	visionVideo.muted = true;
	visionVideo.playsInline = true;
	visionVideo.srcObject = new MediaStream([track]);
	visionVideo.style.position = "fixed";
	visionVideo.style.width = "1px";
	visionVideo.style.height = "1px";
	visionVideo.style.opacity = "0";
	document.body.append(visionVideo);
	visionCanvas = document.createElement("canvas");
	visionCanvas.width = VISION_FRAME_WIDTH;
	visionCanvas.height = frameHeight;
	visionContext = visionCanvas.getContext("2d", { willReadFrequently: true });
	if (!visionContext) return;

	try {
		await visionVideo.play();
	} catch {
		return;
	}

	visionTimer = window.setInterval(() => {
		if (
			!visionVideo ||
			!visionCanvas ||
			!visionContext ||
			visionVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
		) {
			return;
		}

		visionContext.drawImage(visionVideo, 0, 0, visionCanvas.width, visionCanvas.height);
		const image = visionContext.getImageData(0, 0, visionCanvas.width, visionCanvas.height);
		const frame: CursorVisionFrame = {
			width: visionCanvas.width,
			height: visionCanvas.height,
			data: image.data,
		};
		const previousFrame = previousVisionFrame;
		previousVisionFrame = frame;
		if (recorder?.state !== "recording" || !previousFrame) return;

		const position = detectCursorMotion(previousFrame, frame, lastVisionPosition);
		const timeMs = Math.round(elapsedNow());
		if (!position) {
			if (
				lastVisionPosition &&
				!visionClickRecorded &&
				timeMs - lastVisionMovementMs >= 300 &&
				timeMs - lastPointerSampleMs >= 300
			) {
				visionClickRecorded = true;
				lastPointerSampleMs = timeMs;
				cursorTelemetry.push({
					...lastVisionPosition,
					timeMs,
					interactionType: "click",
					cursorType: "arrow",
				});
			}
			return;
		}

		const moved =
			!lastVisionPosition ||
			Math.hypot(position.cx - lastVisionPosition.cx, position.cy - lastVisionPosition.cy) > 0.008;
		if (moved) {
			lastVisionPosition = position;
			lastVisionMovementMs = timeMs;
			visionClickRecorded = false;
			lastPointerSampleMs = timeMs;
			cursorTelemetry.push({ ...position, timeMs, interactionType: "move", cursorType: "arrow" });
		}
	}, VISION_SAMPLE_INTERVAL_MS);
}

export function openBrowserCapture() {
	window.dispatchEvent(new CustomEvent("recordly:web-capture-open"));
}

export async function startBrowserCapture(options: {
	withSystemAudio: boolean;
	withMicrophone: boolean;
}) {
	if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
		throw new Error("Screen recording is not supported in this browser.");
	}

	try {
		displayStream = await navigator.mediaDevices.getDisplayMedia({
			video: { frameRate: { ideal: 30, max: 60 }, cursor: "always" },
			audio: options.withSystemAudio,
		});
		const screenTrack = displayStream.getVideoTracks()[0];
		try {
			await screenTrack?.applyConstraints({ cursor: "always" });
		} catch {
			// Some browsers do not allow changing cursor capture after permission.
		}
		hideOverlayCursorByDefault = true;
		if (options.withMicrophone) {
			microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
		}

		const videoTracks = displayStream.getVideoTracks();
		const audioTracks = [
			...displayStream.getAudioTracks(),
			...(microphoneStream?.getAudioTracks() ?? []),
		];
		const tracks = [...videoTracks];
		if (audioTracks.length > 1) {
			audioContext = new AudioContext();
			await audioContext.resume();
			const destination = audioContext.createMediaStreamDestination();
			for (const track of audioTracks) {
				audioContext.createMediaStreamSource(new MediaStream([track])).connect(destination);
			}
			tracks.push(...destination.stream.getAudioTracks());
		} else {
			tracks.push(...audioTracks);
		}

		const mimeType = selectBrowserScreenRecordingMimeType();
		recorder = new MediaRecorder(new MediaStream(tracks), mimeType ? { mimeType } : undefined);
		chunks = [];
		cursorTelemetry = [];
		lastPointerSampleMs = -Infinity;
		elapsedBeforePause = 0;
		segmentStartedAt = Date.now();
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = async () => {
			const blob = new Blob(chunks, { type: recorder?.mimeType || "video/webm" });
			const durationMs = elapsedBeforePause;
			const duration = durationMs / 1000;
			const capturedCursorTelemetry = cursorTelemetry;
			const shouldHideOverlayCursor = hideOverlayCursorByDefault;
			let playableBlob = blob;
			if (isWebmMimeType(blob.type)) {
				try {
					playableBlob = await repairWebmDuration(blob, durationMs);
				} catch (error) {
					console.warn("Could not repair browser recording duration metadata:", error);
				}
			}
			clearCapture();
			window.dispatchEvent(
				new CustomEvent("recordly:web-capture-ready", {
					detail: {
						blob: playableBlob,
						duration,
						cursorTelemetry: capturedCursorTelemetry,
						hideOverlayCursorByDefault: shouldHideOverlayCursor,
					},
				}),
			);
		};
		displayStream.getVideoTracks()[0]?.addEventListener(
			"ended",
			stopBrowserCapture,
			{ once: true },
		);
		recorder.start(1000);
		void startVisualCursorTracking(displayStream);
		emitState("recording");
		ticker = window.setInterval(() => emitState(recorder?.state === "paused" ? "paused" : "recording"), 250);
	} catch (error) {
		clearCapture();
		throw error;
	}
}

export function pauseBrowserCapture() {
	if (!recorder || recorder.state !== "recording") return;
	const elapsed = elapsedNow();
	recorder.pause();
	elapsedBeforePause = elapsed;
	segmentStartedAt = 0;
	emitState("paused");
}

export function resumeBrowserCapture() {
	if (!recorder || recorder.state !== "paused") return;
	segmentStartedAt = Date.now();
	recorder.resume();
	emitState("recording");
}

export function stopBrowserCapture() {
	if (!recorder || recorder.state === "inactive") return;
	elapsedBeforePause = elapsedNow();
	segmentStartedAt = 0;
	emitState("saving");
	recorder.stop();
}
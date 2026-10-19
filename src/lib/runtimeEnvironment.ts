export function isRecordlyWebBuild() {
	return Boolean(
		typeof window !== "undefined" &&
			(window as Window & { __RECORDLY_WEB__?: boolean }).__RECORDLY_WEB__,
	);
}
import type { User } from "@supabase/supabase-js";

export const recordlyAuthConfigured = false;
export type RecordlyOAuthProvider = "google" | "azure" | "github";

export async function getEnabledSignInProviders(
	signal?: AbortSignal,
): Promise<RecordlyOAuthProvider[]> {
	void signal;
	return [];
}

export const recordlyAuth = null;

function requireAuth() {
	throw new Error("Authentication is disabled in this local build.");
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
	void email;
	void password;
	return requireAuth();
}

export async function sendSignInLink(email: string): Promise<void> {
	void email;
	return requireAuth();
}

export async function sendPasswordReset(email: string): Promise<void> {
	void email;
	return requireAuth();
}

export async function signInWithSocial(provider: "google" | "azure" | "github"): Promise<void> {
	void provider;
	return requireAuth();
}

export async function signInWithSaml(email: string): Promise<void> {
	void email;
	return requireAuth();
}

export async function signOutRecordly(): Promise<void> {
	return Promise.resolve();
}

export async function updateAccountName(name: string): Promise<User> {
	void name;
	return requireAuth();
}

export async function requestAccountEmailChange(email: string): Promise<User> {
	void email;
	return requireAuth();
}

export async function hasRecordlySession(): Promise<boolean> {
	return false;
}

export function completeAuthCallback(_url: string): Promise<void> {
	return Promise.resolve();
}

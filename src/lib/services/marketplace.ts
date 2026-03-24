import type { LightFXTrack, TrackMetadata } from '$lib/types';

// ============================================================
// Configuration
// ============================================================

const API_URL = import.meta.env.VITE_PUBLIC_API_URL ?? 'http://localhost:8000';
const OAUTH_CALLBACK = typeof window !== 'undefined'
	? `${window.location.origin}/auth/callback`
	: '';

const TOKEN_STORAGE_KEY = 'openlightfx-marketplace-token';
const REFRESH_TOKEN_KEY = 'openlightfx-marketplace-refresh-token';

export type OAuthProvider = 'github' | 'google' | 'discord';

// ============================================================
// Authentication
// ============================================================

/**
 * Initiate OAuth authentication via browser redirect.
 * Opens the marketplace OAuth endpoint which redirects back to the callback URL.
 */
export async function authenticateWithMarketplace(
	provider: OAuthProvider = 'github'
): Promise<void> {
	const authUrl = new URL(`${API_URL}/auth/${provider}/authorize`);
	authUrl.searchParams.set('redirect_uri', OAUTH_CALLBACK);

	window.location.href = authUrl.toString();
}

/**
 * Handle the OAuth callback. Extract tokens from URL params and store them.
 */
export function handleAuthCallback(urlParams: URLSearchParams): boolean {
	const accessToken = urlParams.get('access_token');
	const refreshToken = urlParams.get('refresh_token');

	if (!accessToken) return false;

	try {
		localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
		if (refreshToken) {
			localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
		}
	} catch {
		// localStorage unavailable
	}

	return true;
}

/** Check if the user has a stored marketplace token */
export function isAuthenticated(): boolean {
	try {
		return !!localStorage.getItem(TOKEN_STORAGE_KEY);
	} catch {
		return false;
	}
}

/** Get the stored access token */
function getAccessToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_STORAGE_KEY);
	} catch {
		return null;
	}
}

/** Clear stored tokens (logout) */
export function logout(): void {
	try {
		localStorage.removeItem(TOKEN_STORAGE_KEY);
		localStorage.removeItem(REFRESH_TOKEN_KEY);
	} catch {
		// ignore
	}
}

// ============================================================
// Track publishing
// ============================================================

/**
 * Upload a track to the marketplace API.
 */
export async function publishTrack(
	trackData: Uint8Array,
	metadata: TrackMetadata
): Promise<void> {
	const token = getAccessToken();
	if (!token) {
		throw new MarketplaceError('Not authenticated. Please log in to the marketplace first.');
	}

	const formData = new FormData();
	formData.append(
		'file',
		new Blob([trackData], { type: 'application/octet-stream' }),
		`${slugify(metadata.title)}.lightfx`
	);
	formData.append('title', metadata.title);
	formData.append('description', metadata.description);
	formData.append('author', metadata.author);
	formData.append('tags', JSON.stringify(metadata.tags));
	formData.append('duration_ms', String(metadata.durationMs));

	if (metadata.movieReference) {
		formData.append('imdb_id', metadata.movieReference.imdbId);
		formData.append('movie_title', metadata.movieReference.title);
		formData.append('movie_year', String(metadata.movieReference.year));
		formData.append('runtime_minutes', String(metadata.movieReference.runtimeMinutes));
	}

	const response = await fetch(`${API_URL}/api/v1/tracks`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`
		},
		body: formData
	});

	if (!response.ok) {
		let detail = '';
		try {
			const body = await response.json();
			detail = body.detail ?? body.message ?? '';
		} catch {
			// ignore parse errors
		}
		throw new MarketplaceError(
			`Upload failed (${response.status}): ${detail || response.statusText}`
		);
	}
}

// ============================================================
// Marketplace validation
// ============================================================

/**
 * Validate that a track has all required fields for marketplace publishing.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateForMarketplace(track: LightFXTrack): string[] {
	const errors: string[] = [];

	if (!track.metadata.title || track.metadata.title === 'Untitled Track') {
		errors.push('Track title is required');
	}
	if (!track.metadata.description) {
		errors.push('Track description is required');
	}
	if (!track.metadata.author) {
		errors.push('Author name is required');
	}
	if (track.metadata.durationMs <= 0) {
		errors.push('Track duration must be set');
	}
	if (track.channels.length === 0) {
		errors.push('Track must have at least one channel');
	}

	const movie = track.metadata.movieReference;
	if (!movie?.imdbId) {
		errors.push('IMDB ID is required');
	} else if (!/^tt\d{7,}$/.test(movie.imdbId)) {
		errors.push('IMDB ID must match format: tt followed by 7+ digits');
	}
	if (!movie?.title) {
		errors.push('Movie title is required');
	}
	if (!movie?.year || movie.year <= 0) {
		errors.push('Movie year is required');
	}

	return errors;
}

// ============================================================
// Helpers
// ============================================================

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		|| 'track';
}

export class MarketplaceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MarketplaceError';
	}
}

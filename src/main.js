import './style.css'

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`
const IS_LOCAL_DEV = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize'
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_API_URL = 'https://api.spotify.com/v1'
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
]

const STORAGE_KEYS = {
  authState: 'spotify_bulk_delete_auth_state',
  codeVerifier: 'spotify_bulk_delete_code_verifier',
  token: 'spotify_bulk_delete_token',
}

const MOCK_PROFILE = {
  id: 'local-dev-user',
  display_name: 'Local Dev User',
}

const MOCK_PLAYLISTS = [
  {
    id: 'mock-road-trip',
    name: 'Road Trip Cleanup',
    public: false,
    owner: { id: MOCK_PROFILE.id },
    tracks: { total: 84 },
    images: [],
    external_urls: { spotify: 'https://open.spotify.com/' },
  },
  {
    id: 'mock-gym',
    name: 'Old Gym Mix',
    public: true,
    owner: { id: MOCK_PROFILE.id },
    tracks: { total: 37 },
    images: [],
    external_urls: { spotify: 'https://open.spotify.com/' },
  },
  {
    id: 'mock-party',
    name: 'Party Playlist 2018',
    public: false,
    owner: { id: MOCK_PROFILE.id },
    tracks: { total: 112 },
    images: [],
    external_urls: { spotify: 'https://open.spotify.com/' },
  },
  {
    id: 'mock-focus',
    name: 'Focus Drafts',
    public: false,
    owner: { id: MOCK_PROFILE.id },
    tracks: { total: 19 },
    images: [],
    external_urls: { spotify: 'https://open.spotify.com/' },
  },
]

const app = document.querySelector('#app')
const state = {
  token: IS_LOCAL_DEV ? createMockToken() : readToken(),
  profile: null,
  playlists: [],
  selectedPlaylistIds: new Set(),
  deleteResults: [],
  isLoading: false,
  isDeleting: false,
  statusMessage: '',
  errorMessage: '',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function render() {
  if (!CLIENT_ID && !IS_LOCAL_DEV) {
    app.innerHTML = renderMissingConfig()
    bindEvents()
    return
  }

  if (!state.token && !IS_LOCAL_DEV) {
    app.innerHTML = renderSignedOut()
    bindEvents()
    return
  }

  app.innerHTML = renderSignedIn()
  bindEvents()
}

function renderMissingConfig() {
  return `
    <main class="shell narrow">
      <section class="panel hero-panel">
        <p class="eyebrow">Setup required</p>
        <h1>Connect a Spotify app</h1>
        <p>
          Add your Spotify client ID to <code>.env</code>, then restart the Vite dev server.
        </p>
        <pre>VITE_SPOTIFY_CLIENT_ID=your_spotify_app_client_id</pre>
        <p class="muted">
          Your Spotify app redirect URI should include <code>${escapeHtml(REDIRECT_URI)}</code>.
        </p>
      </section>
    </main>
  `
}

function renderSignedOut() {
  return `
    <main class="shell narrow">
      <section class="panel hero-panel">
        <p class="eyebrow">Spotify Playlist Bulk Delete</p>
        <h1>Delete your personal Spotify playlists in bulk</h1>
        <p>
          Sign in with Spotify, select the playlists you own, and remove them from your account.
          Followed and collaborative playlists are hidden.
        </p>
        ${state.errorMessage ? `<p class="alert error">${escapeHtml(state.errorMessage)}</p>` : ''}
        ${state.statusMessage ? `<p class="alert success">${escapeHtml(state.statusMessage)}</p>` : ''}
        <button class="button primary" data-action="sign-in" type="button">
          Sign in with Spotify
        </button>
        <p class="muted">
          This app uses Spotify's official authorization flow and stores tokens only in this browser.
        </p>
      </section>
    </main>
  `
}

function renderSignedIn() {
  const selectedCount = state.selectedPlaylistIds.size
  const totalCount = state.playlists.length
  const hasPlaylists = totalCount > 0
  const allSelected = hasPlaylists && selectedCount === totalCount

  return `
    <main class="shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">Spotify Playlist Bulk Delete</p>
          <h1>Your personal playlists</h1>
          <p class="muted">
            Signed in${state.profile ? ` as ${escapeHtml(state.profile.display_name || state.profile.id)}` : ''}.
            ${IS_LOCAL_DEV ? 'Using local mock data.' : 'Only playlists owned by your account are shown.'}
          </p>
        </div>
        <div class="header-actions">
          <button class="button secondary" data-action="refresh" type="button" ${state.isLoading || state.isDeleting ? 'disabled' : ''}>
            Refresh
          </button>
          <button class="button ghost" data-action="sign-out" type="button" ${state.isDeleting ? 'disabled' : ''}>
            Sign out
          </button>
        </div>
      </header>

      ${state.errorMessage ? `<p class="alert error">${escapeHtml(state.errorMessage)}</p>` : ''}
      ${state.statusMessage ? `<p class="alert success">${escapeHtml(state.statusMessage)}</p>` : ''}

      <section class="panel">
        <div class="toolbar">
          <label class="check-row select-all">
            <input
              data-action="toggle-all"
              type="checkbox"
              ${allSelected ? 'checked' : ''}
              ${!hasPlaylists || state.isDeleting ? 'disabled' : ''}
            />
            <span>Select all</span>
          </label>
          <div class="toolbar-summary">
            <strong>${selectedCount}</strong> selected
            <span aria-hidden="true">/</span>
            <strong>${totalCount}</strong> owned playlists
          </div>
          <button class="button danger" data-action="delete-selected" type="button" ${selectedCount === 0 || state.isDeleting ? 'disabled' : ''}>
            ${state.isDeleting ? 'Deleting...' : `Delete selected${selectedCount ? ` (${selectedCount})` : ''}`}
          </button>
        </div>

        ${renderPlaylistContent()}
      </section>

      ${renderDeleteResults()}
    </main>
  `
}

function renderPlaylistContent() {
  if (state.isLoading) {
    return '<div class="empty-state">Loading your Spotify playlists...</div>'
  }

  if (state.playlists.length === 0) {
    return `
      <div class="empty-state">
        <h2>No owned playlists found</h2>
        <p>There may still be playlists you follow, but this app only lists playlists owned by your Spotify account.</p>
      </div>
    `
  }

  return `
    <div class="playlist-list">
      ${state.playlists.map(renderPlaylist).join('')}
    </div>
  `
}

function renderPlaylist(playlist) {
  const imageUrl = playlist.images?.[0]?.url
  const isSelected = state.selectedPlaylistIds.has(playlist.id)
  const trackCount = playlist.tracks?.total ?? 0

  return `
    <article class="playlist-card">
      <label class="playlist-select" aria-label="Select ${escapeHtml(playlist.name)}">
        <input
          data-action="toggle-playlist"
          data-playlist-id="${escapeHtml(playlist.id)}"
          type="checkbox"
          ${isSelected ? 'checked' : ''}
          ${state.isDeleting ? 'disabled' : ''}
        />
      </label>
      <div class="playlist-art ${imageUrl ? '' : 'fallback-art'}">
        ${
          imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />`
            : '<span aria-hidden="true">♪</span>'
        }
      </div>
      <div class="playlist-details">
        <h2>${escapeHtml(playlist.name)}</h2>
        <p>
          ${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}
          <span aria-hidden="true">.</span>
          ${playlist.public ? 'Public' : 'Private'}
        </p>
      </div>
      <a class="spotify-link" href="${escapeHtml(playlist.external_urls?.spotify || '#')}" target="_blank" rel="noreferrer">
        Open
      </a>
    </article>
  `
}

function renderDeleteResults() {
  if (state.deleteResults.length === 0) {
    return ''
  }

  return `
    <section class="panel results-panel" aria-live="polite">
      <h2>Delete results</h2>
      <ul class="results-list">
        ${state.deleteResults
          .map(
            (result) => `
              <li class="${result.ok ? 'success-text' : 'error-text'}">
                <strong>${escapeHtml(result.name)}</strong>
                <span>${result.ok ? 'Deleted' : escapeHtml(result.error)}</span>
              </li>
            `,
          )
          .join('')}
      </ul>
    </section>
  `
}

function bindEvents() {
  app.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', handleAction)
    element.addEventListener('change', handleAction)
  })
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action

  if (action === 'sign-in') {
    await signIn()
  }

  if (action === 'sign-out') {
    signOut()
  }

  if (action === 'refresh') {
    await loadSpotifyData()
  }

  if (action === 'toggle-all') {
    toggleAllPlaylists(event.currentTarget.checked)
  }

  if (action === 'toggle-playlist') {
    togglePlaylist(event.currentTarget.dataset.playlistId, event.currentTarget.checked)
  }

  if (action === 'delete-selected') {
    await deleteSelectedPlaylists()
  }
}

async function signIn() {
  if (IS_LOCAL_DEV) {
    loadMockData('Loaded local mock Spotify data.')
    return
  }

  state.errorMessage = ''
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const authState = crypto.randomUUID()

  sessionStorage.setItem(STORAGE_KEYS.codeVerifier, verifier)
  sessionStorage.setItem(STORAGE_KEYS.authState, authState)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    redirect_uri: REDIRECT_URI,
    state: authState,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'true',
  })

  window.location.assign(`${SPOTIFY_AUTH_URL}?${params}`)
}

function signOut(message = 'Signed out.') {
  if (IS_LOCAL_DEV) {
    state.selectedPlaylistIds.clear()
    state.deleteResults = []
    loadMockData('Reset local mock Spotify data.')
    return
  }

  localStorage.removeItem(STORAGE_KEYS.token)
  sessionStorage.removeItem(STORAGE_KEYS.authState)
  sessionStorage.removeItem(STORAGE_KEYS.codeVerifier)
  state.token = null
  state.profile = null
  state.playlists = []
  state.selectedPlaylistIds.clear()
  state.deleteResults = []
  state.statusMessage = message
  state.errorMessage = ''
  render()
}

function toggleAllPlaylists(checked) {
  if (checked) {
    state.playlists.forEach((playlist) => state.selectedPlaylistIds.add(playlist.id))
  } else {
    state.selectedPlaylistIds.clear()
  }

  render()
}

function togglePlaylist(playlistId, checked) {
  if (!playlistId) {
    return
  }

  if (checked) {
    state.selectedPlaylistIds.add(playlistId)
  } else {
    state.selectedPlaylistIds.delete(playlistId)
  }

  render()
}

async function deleteSelectedPlaylists() {
  const selectedPlaylists = state.playlists.filter((playlist) =>
    state.selectedPlaylistIds.has(playlist.id),
  )

  if (selectedPlaylists.length === 0) {
    return
  }

  const confirmed = window.confirm(
    `Delete ${selectedPlaylists.length} selected playlist${
      selectedPlaylists.length === 1 ? '' : 's'
    } from your Spotify account? This cannot be undone from this app.`,
  )

  if (!confirmed) {
    return
  }

  state.isDeleting = true
  state.errorMessage = ''
  state.statusMessage = ''
  state.deleteResults = []
  render()

  const results = []

  for (const playlist of selectedPlaylists) {
    try {
      if (IS_LOCAL_DEV) {
        await wait(150)
      } else {
        await spotifyFetch(`/playlists/${playlist.id}/followers`, { method: 'DELETE' })
      }
      results.push({ id: playlist.id, name: playlist.name, ok: true })
      state.selectedPlaylistIds.delete(playlist.id)
    } catch (error) {
      results.push({
        id: playlist.id,
        name: playlist.name,
        ok: false,
        error: error.message || 'Delete failed',
      })
    }

    state.deleteResults = [...results]
    render()
  }

  const deletedIds = new Set(results.filter((result) => result.ok).map((result) => result.id))
  state.playlists = state.playlists.filter((playlist) => !deletedIds.has(playlist.id))
  state.isDeleting = false
  state.statusMessage = deletedIds.size
    ? `Deleted ${deletedIds.size} playlist${deletedIds.size === 1 ? '' : 's'}.`
    : ''
  state.errorMessage = results.some((result) => !result.ok)
    ? 'Some playlists could not be deleted. Review the results below.'
    : ''
  render()
}

async function init() {
  render()

  if (IS_LOCAL_DEV) {
    loadMockData('Loaded local mock Spotify data.')
    return
  }

  if (!CLIENT_ID) {
    return
  }

  try {
    const handledCallback = await handleAuthCallback()

    if (!handledCallback && state.token && isTokenExpired(state.token)) {
      state.token = await refreshAccessToken(state.token.refresh_token)
      saveToken(state.token)
    }

    if (state.token) {
      await loadSpotifyData()
    }
  } catch (error) {
    clearToken()
    state.errorMessage = error.message || 'Spotify authentication failed.'
    render()
  }
}

async function handleAuthCallback() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')

  if (error) {
    cleanUrl()
    throw new Error(`Spotify sign-in failed: ${error}`)
  }

  if (!code) {
    return false
  }

  const returnedState = params.get('state')
  const expectedState = sessionStorage.getItem(STORAGE_KEYS.authState)
  const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.codeVerifier)

  if (!returnedState || returnedState !== expectedState || !codeVerifier) {
    cleanUrl()
    throw new Error('Spotify sign-in could not be verified. Please try again.')
  }

  state.isLoading = true
  render()

  const token = await exchangeCodeForToken(code, codeVerifier)
  state.token = token
  saveToken(token)
  sessionStorage.removeItem(STORAGE_KEYS.authState)
  sessionStorage.removeItem(STORAGE_KEYS.codeVerifier)
  cleanUrl()
  state.statusMessage = 'Signed in with Spotify.'
  state.isLoading = false
  return true
}

async function exchangeCodeForToken(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  })

  return requestToken(body)
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error('Spotify session expired. Please sign in again.')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  })

  const token = await requestToken(body)
  return {
    ...token,
    refresh_token: token.refresh_token || refreshToken,
  }
}

async function requestToken(body) {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Spotify token request failed.')
  }

  return {
    ...payload,
    expires_at: Date.now() + payload.expires_in * 1000,
  }
}

async function loadSpotifyData() {
  if (IS_LOCAL_DEV) {
    loadMockData('Refreshed local mock Spotify data.')
    return
  }

  state.isLoading = true
  state.errorMessage = ''
  state.deleteResults = []
  render()

  try {
    const profile = await spotifyFetch('/me')
    const playlists = await getAllPlaylists()

    state.profile = profile
    state.playlists = playlists
      .filter((playlist) => playlist.owner?.id === profile.id)
      .sort((a, b) => a.name.localeCompare(b.name))
    state.selectedPlaylistIds = new Set(
      [...state.selectedPlaylistIds].filter((id) =>
        state.playlists.some((playlist) => playlist.id === id),
      ),
    )
    state.statusMessage = `Loaded ${state.playlists.length} owned playlist${
      state.playlists.length === 1 ? '' : 's'
    }.`
  } catch (error) {
    state.errorMessage = error.message || 'Could not load Spotify playlists.'
  } finally {
    state.isLoading = false
    render()
  }
}

function loadMockData(message) {
  state.token = createMockToken()
  state.profile = MOCK_PROFILE
  state.playlists = MOCK_PLAYLISTS.map((playlist) => ({ ...playlist }))
  state.selectedPlaylistIds = new Set(
    [...state.selectedPlaylistIds].filter((id) =>
      state.playlists.some((playlist) => playlist.id === id),
    ),
  )
  state.deleteResults = []
  state.isLoading = false
  state.isDeleting = false
  state.errorMessage = ''
  state.statusMessage = message
  render()
}

async function getAllPlaylists() {
  const playlists = []
  let nextPath = '/me/playlists?limit=50'

  while (nextPath) {
    const page = await spotifyFetch(nextPath)
    playlists.push(...(page.items || []))
    nextPath = page.next ? page.next.replace(SPOTIFY_API_URL, '') : ''
  }

  return playlists
}

async function spotifyFetch(path, options = {}) {
  if (!state.token) {
    throw new Error('Please sign in with Spotify first.')
  }

  if (isTokenExpired(state.token)) {
    state.token = await refreshAccessToken(state.token.refresh_token)
    saveToken(state.token)
  }

  const response = await fetch(path.startsWith('https://') ? path : `${SPOTIFY_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.token.access_token}`,
      ...(options.headers || {}),
    },
  })

  if (response.status === 401) {
    clearToken()
    throw new Error('Spotify session expired. Please sign in again.')
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error?.message || `Spotify request failed (${response.status}).`)
  }

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('application/json') ? response.json() : null
}

function readToken() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.token))
  } catch {
    return null
  }
}

function createMockToken() {
  return {
    access_token: 'local-dev-mock-token',
    expires_at: Number.POSITIVE_INFINITY,
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

function saveToken(token) {
  localStorage.setItem(STORAGE_KEYS.token, JSON.stringify(token))
}

function clearToken() {
  localStorage.removeItem(STORAGE_KEYS.token)
  state.token = null
}

function isTokenExpired(token) {
  return !token?.access_token || Date.now() > token.expires_at - 60_000
}

function cleanUrl() {
  window.history.replaceState({}, document.title, REDIRECT_URI)
}

function generateCodeVerifier() {
  const values = new Uint8Array(64)
  crypto.getRandomValues(values)
  return base64UrlEncode(values)
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

init()

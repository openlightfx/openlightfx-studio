<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const VERSION = '1.0.0-alpha';
  const GITHUB_URL = 'https://github.com/openlightfx/openlightfx-studio';
  const WEBSITE_URL = 'https://openlightfx.com';
</script>

<Modal title="About" {onclose}>
  <div class="space-y-6 min-w-[22rem]">

    <!-- Identity -->
    <div class="flex items-center gap-4">
      <div class="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
        <svg class="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
      </div>
      <div>
        <h3 class="text-base font-semibold text-text-base">OpenLightFX Studio</h3>
        <p class="text-sm text-textMuted">Version {VERSION}</p>
      </div>
    </div>

    <!-- Description -->
    <p class="text-sm text-textMuted leading-relaxed">
      Create and export ambient lighting tracks for movies and media. Synchronize light channels to video playback and export to the <code class="text-accent text-xs bg-surface2 px-1.5 py-0.5 rounded">.lightfx</code> format.
    </p>

    <!-- Links -->
    <div class="space-y-2">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-surface2 hover:bg-surface3 transition-colors group"
      >
        <svg class="w-5 h-5 text-textMuted group-hover:text-text-base transition-colors" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
        </svg>
        <div>
          <p class="text-sm font-medium text-text-base">GitHub</p>
          <p class="text-xs text-textMuted">Source code &amp; issues</p>
        </div>
        <svg class="w-4 h-4 text-textMuted ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
        </svg>
      </a>

      <a
        href={WEBSITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-surface2 hover:bg-surface3 transition-colors group"
      >
        <svg class="w-5 h-5 text-textMuted group-hover:text-text-base transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
        </svg>
        <div>
          <p class="text-sm font-medium text-text-base">Website</p>
          <p class="text-xs text-textMuted">openlightfx.com</p>
        </div>
        <svg class="w-4 h-4 text-textMuted ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
        </svg>
      </a>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between pt-2 border-t border-surface3">
      <p class="text-xs text-textMuted">MIT License</p>
      <Button variant="secondary" size="sm" onclick={onclose}>Close</Button>
    </div>

  </div>
</Modal>

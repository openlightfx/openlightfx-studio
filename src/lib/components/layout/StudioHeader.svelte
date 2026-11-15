<script lang="ts">
  import StudioIcon from '$lib/components/shared/StudioIcon.svelte';

  let { current }: { current: 'bulbs' | 'rooms' | 'library' } = $props();
  const sections = [
    { id: 'bulbs', label: 'Bulbs', icon: 'bulb' },
    { id: 'rooms', label: 'Rooms', icon: 'room' },
    { id: 'library', label: 'Library', icon: 'library' },
  ];
</script>

<header class="studio-header">
  <div class="brand">
    <span class="brand-mark"><StudioIcon name="bulb" size={23} /></span>
    <strong>OpenLightFX <span>Studio</span></strong>
  </div>
  <nav aria-label="Studio">
    {#each sections as section}
      <a href={'#/' + section.id} aria-current={current === section.id ? 'page' : undefined}>
        <StudioIcon name={section.icon} size={18} /><span>{section.label}</span>
      </a>
    {/each}
  </nav>
  <div class="header-end">
    <span class="emby-label">for Emby</span>
  </div>
</header>

<style>
  .studio-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-8);
    min-height: var(--header-height);
    padding: 0 var(--page-gutter);
    background: var(--header-bg);
    border-bottom: 1px solid var(--border);
  }
  .brand,
  nav,
  nav a,
  .header-end {
    display: flex;
    align-items: center;
  }
  .brand {
    gap: var(--space-3);
    white-space: nowrap;
  }
  .brand-mark {
    display: flex;
    color: var(--accent);
  }
  strong {
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -0.025em;
  }
  strong span {
    color: var(--text-muted);
    font-weight: 400;
    margin-left: 3px;
  }
  nav {
    align-items: stretch;
    align-self: stretch;
    gap: var(--space-2);
  }
  nav a {
    position: relative;
    gap: var(--space-2);
    padding: 0 var(--space-4);
    color: var(--text-muted);
    text-decoration: none;
    font-weight: 500;
    transition:
      color var(--transition),
      background var(--transition);
  }
  nav a:hover {
    color: var(--text);
    background: var(--hover);
  }
  nav a[aria-current='page'] {
    color: var(--accent-text);
  }
  nav a[aria-current='page']::after {
    content: '';
    position: absolute;
    inset: auto var(--space-4) -1px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--accent);
  }
  .header-end {
    margin-left: auto;
    gap: var(--space-6);
  }
  .emby-label {
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  @media (max-width: 760px) {
    .studio-header {
      flex-wrap: wrap;
      gap: 0;
      padding-top: var(--space-3);
    }
    .brand {
      min-height: 32px;
    }
    nav {
      order: 3;
      width: 100%;
      height: 48px;
      margin-top: var(--space-2);
    }
    nav a {
      flex: 1;
      justify-content: center;
      padding: 0 var(--space-3);
    }
    .header-end {
      gap: var(--space-4);
    }
    .emby-label {
      display: none;
    }
  }
</style>

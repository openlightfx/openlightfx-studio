<script lang="ts">
  import { Modal, Button } from '$lib/components/shared/index.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';

  let open = $derived(
    uiStore.state.activeModal === 'welcome' || !uiStore.state.onboardingComplete
  );

  let step = $state(0);
  let dontShowAgain = $state(false);
  const totalSteps = 4;

  interface OnboardingStep {
    title: string;
    illustration: string;
    body: string;
  }

  const steps: OnboardingStep[] = [
    {
      title: '🎬 Load a Video',
      illustration: '📂 → 🎥',
      body: 'Start by loading a video file using the File menu or drag-and-drop. OpenLightFX Studio uses the browser File API — your video stays on your computer and is never uploaded.',
    },
    {
      title: '💡 Create Channels',
      illustration: '💡  💡  💡  💡',
      body: 'Channels represent your smart bulbs. Use a channel template for quick setup (e.g. "4-Corner Room") or create channels manually. Each channel gets a spatial hint like Left, Right, or Behind Screen.',
    },
    {
      title: '🎨 Add Keyframes',
      illustration: '🔵──🟡──🔴──⚫',
      body: 'Double-click on a channel lane or press K to add a keyframe at the playhead. Use the color picker to set the bulb color and brightness. Keyframes interpolate between each other to create smooth transitions.',
    },
    {
      title: '📦 Export Your Track',
      illustration: '💾 → .lightfx',
      body: 'When you\'re done, export your track as a .lightfx file. This portable format works with the Emby plugin — just drop it in and your lights will sync to the movie automatically!',
    },
  ];

  const currentStep = $derived(steps[step]);
  const isFirst = $derived(step === 0);
  const isLast = $derived(step === totalSteps - 1);

  function handleNext() {
    if (isLast) {
      handleFinish();
    } else {
      step += 1;
    }
  }

  function handleBack() {
    if (step > 0) step -= 1;
  }

  function handleSkip() {
    handleFinish();
  }

  function handleFinish() {
    if (dontShowAgain) {
      uiStore.completeOnboarding();
    }
    uiStore.closeModal();
    step = 0;
  }
</script>

<Modal {open} title="Welcome to OpenLightFX Studio" onclose={handleSkip}>
  <div class="flex flex-col gap-4">
    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-2">
      {#each { length: totalSteps } as _, i}
        <div
          class="h-1.5 w-8 rounded-full transition-colors {i === step
            ? 'bg-accent'
            : i < step
              ? 'bg-accent/40'
              : 'bg-surface2'}"
        ></div>
      {/each}
    </div>

    <!-- Step content -->
    <div class="text-center">
      <h3 class="mb-3 text-base font-semibold text-text-base">{currentStep.title}</h3>
      <div
        class="mb-4 flex items-center justify-center rounded-md border border-surface2 bg-surface2/50 py-6 text-2xl tracking-widest"
        aria-hidden="true"
      >
        {currentStep.illustration}
      </div>
      <p class="text-sm leading-relaxed text-textMuted">{currentStep.body}</p>
    </div>

    <!-- Don't show again -->
    <label class="flex items-center gap-2 self-center text-xs text-textMuted">
      <input type="checkbox" bind:checked={dontShowAgain} class="rounded" />
      Don't show again
    </label>
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={handleSkip}>Skip</Button>
    <div class="flex-1"></div>
    {#if !isFirst}
      <Button variant="secondary" onclick={handleBack}>Back</Button>
    {/if}
    <Button variant="primary" onclick={handleNext}>
      {isLast ? 'Get Started' : 'Next'}
    </Button>
  {/snippet}
</Modal>
